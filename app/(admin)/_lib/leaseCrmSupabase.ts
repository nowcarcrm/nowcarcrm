import { devLog } from "@/app/_lib/devLog";
import { SEED_LEADS } from "./leaseCrmSeed";
import { getSupabaseConfigStatus, supabase } from "./supabaseClient";
import {
  CREDIT_REVIEW_STATUS_OPTIONS,
  defaultLeadOperationalFields,
  LEAD_PRIORITY_OPTIONS,
  normalizeCounselingStatus,
  type CounselingRecord,
  type ContractInfo,
  type CreditReviewStatus,
  type CustomerType,
  type ExportProgress,
  type Lead,
  type LeadPriority,
  type Notice,
  type QuoteDeliveryType,
  type QuoteHistoryEntry,
} from "./leaseCrmTypes";
import type { UserRole } from "./usersSupabase";
import {
  applyContractExtraToInfo,
  applyContractSnapshotBeforeSave,
  buildContractExtraFromInfo,
  clampPercent,
  formatDepositDbLine,
  joinContractNote,
  normalizeQuoteMoneyForPersistence,
  parseDigitsToInt,
  parseLegacyDepositLine,
  percentFromAmount,
  safeNonNegativeInt,
  shouldPersistContractExtra,
  splitContractNote,
} from "./leaseCrmContractPersist";
function ensureSupabaseConfigured() {
  const status = getSupabaseConfigStatus();
  if (!status.ok) {
    throw new Error(
      "Supabase 환경변수가 유효하지 않습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 실제 값으로 설정하세요."
    );
  }
}

export function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const e = error as Record<string, unknown>;
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ");
}

/** PostgREST가 serial/bigint 등으로 id를 숫자로 줄 수 있어 CRM에서는 문자열 PK로 통일 */
function coerceDbStringId(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function nullableDbStringId(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  return s === "" ? null : s;
}

/** users.id / scope.userId — trim 금지, null·빈 문자열만 배제 */
function nonEmptyUserId(uid: string | null | undefined): string | null {
  if (uid == null) return null;
  const s = typeof uid === "string" ? uid : String(uid);
  return s === "" ? null : s;
}

/** PostgREST/DB에 counselor·method 등 확장 컬럼이 없을 때도 insert가 되도록 memo에 구조화 저장 */
const CRM_CONSULTATION_MEMO_PREFIX = "CRM1:";

/** leads 테이블에 없는 확장 필드(고객유형·메모·심사·견적 등)를 consultations 한 행으로 영속화 */
const CRM_LEAD_EXTRA_PREFIX = "CRM_EXTRA:v1:";

type LeadExtraPayloadV1 = {
  v?: number;
  customerType?: string;
  memo?: string;
  contractTerm?: string;
  depositOrPrepaymentAmount?: string;
  wantedMonthlyPayment?: number;
  hasDepositOrPrepayment?: boolean;
  leadPriority?: string;
  failureReason?: string;
  failureReasonNote?: string;
  creditReviewStatus?: string;
  quoteHistory?: unknown;
};

function coalescePriority(raw: string | undefined): LeadPriority {
  if (raw && (LEAD_PRIORITY_OPTIONS as readonly string[]).includes(raw)) {
    return raw as LeadPriority;
  }
  return "일반";
}

function coalesceCreditReview(raw: string | undefined): CreditReviewStatus {
  if (raw && (CREDIT_REVIEW_STATUS_OPTIONS as readonly string[]).includes(raw)) {
    return raw as CreditReviewStatus;
  }
  return "심사 전";
}

function normalizeQuoteHistory(raw: unknown): QuoteHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const quotedAt = typeof o.quotedAt === "string" ? o.quotedAt.slice(0, 10) : "";
    if (!id || !quotedAt) continue;
    const productType = o.productType === "리스" ? "리스" : "렌트";
    const vehiclePrice = safeNonNegativeInt(o.vehiclePrice);

    const legacyDep = typeof o.deposit === "string" ? o.deposit : "";
    const legacyPre = typeof o.prepayment === "string" ? o.prepayment : "";
    let depositAmount = safeNonNegativeInt(o.depositAmount);
    if (!depositAmount && legacyDep) depositAmount = parseDigitsToInt(legacyDep);
    let prepaymentAmount = safeNonNegativeInt(o.prepaymentAmount);
    if (!prepaymentAmount && legacyPre) prepaymentAmount = parseDigitsToInt(legacyPre);

    const depositPercent = clampPercent(
      typeof o.depositPercent === "number" && Number.isFinite(o.depositPercent)
        ? o.depositPercent
        : 0
    );
    const prepaymentPercent = clampPercent(
      typeof o.prepaymentPercent === "number" && Number.isFinite(o.prepaymentPercent)
        ? o.prepaymentPercent
        : 0
    );
    const feeAmountRaw = safeNonNegativeInt(o.feeAmount);
    const feePercentRaw = clampPercent(
      typeof o.feePercent === "number" && Number.isFinite(o.feePercent) ? o.feePercent : 0
    );

    const money = normalizeQuoteMoneyForPersistence(vehiclePrice, {
      depositAmount,
      depositPercent,
      prepaymentAmount,
      prepaymentPercent,
      feeAmount: feeAmountRaw,
      feePercent: feePercentRaw,
    });

    const deliveryRaw = o.deliveryType;
    const deliveryType: QuoteDeliveryType =
      deliveryRaw === "special" || deliveryRaw === "agency" ? deliveryRaw : "agency";

    out.push({
      id,
      quotedAt,
      productType,
      financeCompany: typeof o.financeCompany === "string" ? o.financeCompany : "",
      vehicleModel: typeof o.vehicleModel === "string" ? o.vehicleModel : "",
      vehiclePrice,
      contractTerm: typeof o.contractTerm === "string" ? o.contractTerm : "36개월",
      depositAmount: money.depositAmount,
      depositPercent: money.depositPercent,
      prepaymentAmount: money.prepaymentAmount,
      prepaymentPercent: money.prepaymentPercent,
      feeAmount: money.feeAmount,
      feePercent: money.feePercent,
      monthlyPayment:
        typeof o.monthlyPayment === "number" && Number.isFinite(o.monthlyPayment)
          ? Math.max(0, o.monthlyPayment)
          : 0,
      deliveryType,
      maintenanceIncluded: o.maintenanceIncluded === true,
      note: typeof o.note === "string" ? o.note : "",
    });
  }
  return out;
}

function parseLeadExtraMemo(memo: string | null | undefined): LeadExtraPayloadV1 | null {
  const m = memo ?? "";
  if (!m.startsWith(CRM_LEAD_EXTRA_PREFIX)) return null;
  try {
    return JSON.parse(m.slice(CRM_LEAD_EXTRA_PREFIX.length)) as LeadExtraPayloadV1;
  } catch {
    return null;
  }
}

function serializeLeadExtraMemo(lead: Lead): string {
  const payload: LeadExtraPayloadV1 = {
    v: 1,
    customerType: lead.base.customerType,
    memo: lead.base.memo,
    contractTerm: lead.base.contractTerm,
    depositOrPrepaymentAmount: lead.base.depositOrPrepaymentAmount,
    wantedMonthlyPayment: lead.base.wantedMonthlyPayment,
    hasDepositOrPrepayment: lead.base.hasDepositOrPrepayment,
    leadPriority: lead.leadPriority,
    failureReason: lead.failureReason,
    failureReasonNote: lead.failureReasonNote,
    creditReviewStatus: lead.creditReviewStatus,
    quoteHistory: lead.quoteHistory,
  };
  return CRM_LEAD_EXTRA_PREFIX + JSON.stringify(payload);
}

function isUuidString(value: unknown): boolean {
  if (value == null || value === "") return false;
  const s = typeof value === "string" ? value : String(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

/** 상담기록 행 id — DB·클라이언트 키 일치용(문자열만 trim, lead PK에는 사용하지 않음) */
function counselingRecordIdKey(id: unknown): string {
  if (id == null || id === "") return "";
  return typeof id === "string" ? id.trim() : String(id);
}

export function normalizeLeadForPersistence(lead: Lead): Lead {
  const fill = defaultLeadOperationalFields();
  return {
    ...lead,
    id: coerceDbStringId(lead.id),
    leadPriority: lead.leadPriority ?? fill.leadPriority,
    failureReason: lead.failureReason ?? fill.failureReason,
    failureReasonNote: lead.failureReasonNote ?? fill.failureReasonNote,
    creditReviewStatus: lead.creditReviewStatus ?? fill.creditReviewStatus,
    quoteHistory: Array.isArray(lead.quoteHistory) ? lead.quoteHistory : fill.quoteHistory,
    counselingRecords: Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [],
  };
}

function coalesceConsultMethod(
  raw: string | null | undefined
): CounselingRecord["method"] {
  if (raw === "전화" || raw === "문자" || raw === "카톡" || raw === "방문") return raw;
  return "전화";
}

function coalesceConsultImportance(
  raw: string | null | undefined
): CounselingRecord["importance"] {
  if (raw === "높음" || raw === "낮음" || raw === "보통") return raw;
  return "보통";
}

function serializeConsultationToMemo(r: CounselingRecord): string {
  return `${CRM_CONSULTATION_MEMO_PREFIX}${JSON.stringify({
    v: 1,
    counselor: r.counselor,
    method: r.method,
    importance: r.importance,
    reaction: r.reaction,
    desiredProgressAt: r.desiredProgressAt,
    nextContactAt: r.nextContactAt,
    nextContactMemo: r.nextContactMemo,
    content: r.content,
  })}`;
}

/** 관리자·매니저: 클라이언트가 넘긴 managerUserId 또는 담당명(users.name)으로 UUID 조회 */
async function resolveManagerUserIdForAdmin(lead: Lead): Promise<string | null> {
  if (lead.managerUserId) return lead.managerUserId;
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("name", lead.base.ownerStaff)
    .maybeSingle();
  if (error) throw new Error(`담당자 매핑 조회 실패: ${formatSupabaseError(error)}`);
  return (data as { id: string } | null)?.id ?? null;
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn("[getAuthenticatedUserId] auth.getUser failed", formatSupabaseError(error));
    return null;
  }
  return nonEmptyUserId(data.user?.id) ?? null;
}

async function fetchUserDisplayNameById(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`담당자 이름 조회 실패: ${formatSupabaseError(error)}`);
  return (data as { name: string } | null)?.name?.trim() || null;
}

/** PostgREST/Supabase 클라이언트 에러 형태를 로그용으로 정규화 */
function postgrestLikeFields(err: unknown): {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
} {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const code = o.code != null ? String(o.code) : null;
    const message =
      typeof o.message === "string"
        ? o.message
        : err instanceof Error
          ? err.message
          : String(err);
    const details = typeof o.details === "string" ? o.details : null;
    const hint = typeof o.hint === "string" ? o.hint : null;
    return { code, message, details, hint };
  }
  return {
    code: null,
    message: err instanceof Error ? err.message : String(err),
    details: null,
    hint: null,
  };
}

/**
 * 저장 직전: 직원(staff)은 담당 userId·표시명 고정 + 상담기록은 **DB에 없는 id만** 상담 담당자를 본인으로 설정(기존 이력 담당자는 DB 메모/컬럼 그대로 복원, 프론트 조작 방지).
 * 관리자·매니저는 기존 매핑 규칙 유지.
 *
 * throw 가능 지점(내부 호출):
 * - staff: fetchUserDisplayNameById → users 조회 error 시 throw
 * - admin/manager: resolveManagerUserIdForAdmin → users 조회 error 시 throw
 */
async function prepareLeadForSupabaseWrite(lead: Lead, scope?: ViewerScope): Promise<Lead> {
  try {
    if (scope?.role === "staff") {
      const fromDb = await fetchUserDisplayNameById(scope.userId);
      const ownerStaff = fromDb || lead.base.ownerStaff;
      const staffCounselorLabel = (ownerStaff ?? "").trim() || lead.base.ownerStaff?.trim() || "";
      const managerFallback = (lead.base.ownerStaff ?? "").trim() || staffCounselorLabel;

      let counselingRecords = lead.counselingRecords;
      if (Array.isArray(counselingRecords)) {
        const leadPk = coerceDbStringId(lead.id);
        const missingLeadId = leadPk === "";
        let persisted: Map<string, string> | null = null;
        if (!missingLeadId) {
          try {
            persisted = await fetchPersistedCounselorByConsultationId(leadPk, managerFallback);
          } catch (raw) {
            console.warn(
              "[prepareLeadForSupabaseWrite] staff: consultations 조회 실패 — 상담 담당자 필드는 클라 값 유지(담당 user·이름만 고정)",
              formatSupabaseError(raw)
            );
            persisted = null;
          }
        }
        const enforceCounselorRules = missingLeadId || persisted !== null;
        if (enforceCounselorRules) {
          const byId = persisted ?? new Map<string, string>();
          counselingRecords = counselingRecords.map((r) => {
            const id = counselingRecordIdKey(r?.id);
            if (!id) {
              return { ...r, counselor: staffCounselorLabel };
            }
            if (byId.has(id)) {
              return { ...r, counselor: byId.get(id)! };
            }
            return { ...r, counselor: staffCounselorLabel };
          });
        }
      }

      return {
        ...lead,
        managerUserId: scope.userId,
        base: { ...lead.base, ownerStaff },
        counselingRecords,
      };
    }
    const selectedUserId = nonEmptyUserId(lead.managerUserId) ?? null;
    console.log("selectedUserId:", selectedUserId);
    const authUserId = await getAuthenticatedUserId();
    const managerUserId = selectedUserId || authUserId || (await resolveManagerUserIdForAdmin(lead));
    if (!managerUserId) {
      throw new Error("manager_user_id 없음");
    }
    return { ...lead, managerUserId };
  } catch (raw) {
    const { code, message, details, hint } = postgrestLikeFields(raw);
    console.error("[prepareLeadForSupabaseWrite] failed(full)", {
      code,
      message,
      details,
      hint,
      lead,
      scope: scope ?? null,
      raw,
    });
    throw raw;
  }
}


type LeadRow = {
  id: string;
  name: string;
  phone: string;
  car_model: string;
  source: string;
  status: string;
  sensitivity: string;
  manager: string;
  manager_user_id: string | null;
  next_contact_at: string | null;
  summary_text?: string | null;
  next_action?: string | null;
  customer_intent?: string | null;
  created_at: string;
};

export type LeadSupabaseScope = {
  role: UserRole;
  userId: string;
  /**
   * 관리자 운영 전용 화면에서만 true. 담당(`manager_user_id`) 필터 없이 전체 고객 조회·수정·삭제.
   * `role === "admin"` 일 때만 실제로 적용됩니다(다른 역할의 위조 방지).
   */
  operationalFullAccess?: boolean;
};

type ViewerScope = LeadSupabaseScope;

/** 운영 화면 전체 접근: 관리자 + 명시 플래그만 인정 */
export function hasOperationalFullAccess(scope?: ViewerScope): boolean {
  return scope?.role === "admin" && scope.operationalFullAccess === true;
}

/** 전사 데이터·수수료·상담일 집계 등: 클라이언트 위조 방지 + 명시적 가드 */
export function assertAdminOperationalScope(
  scope: ViewerScope | undefined,
  context: string
): asserts scope is ViewerScope & { role: "admin"; operationalFullAccess: true } {
  if (!hasOperationalFullAccess(scope)) {
    throw new Error(`${context}: 관리자(운영) 권한이 필요합니다.`);
  }
}

function shouldFilterLeadsByManager(scope?: ViewerScope): boolean {
  return !hasOperationalFullAccess(scope);
}

type ConsultationRow = {
  id: string;
  lead_id: string;
  counselor: string | null;
  method: string | null;
  importance: string | null;
  reaction: string | null;
  desired_progress_at: string | null;
  next_action_at: string | null;
  next_contact_memo: string | null;
  memo: string;
  created_at: string;
};

type ContractRow = {
  id: string;
  lead_id: string;
  product: string | null;
  vehicle_name: string | null;
  monthly_payment: number | null;
  contract_term: string | null;
  deposit_or_prepayment: string | null;
  customer_support_amount: number | null;
  supplies_support_content: string | null;
  supplies_support_amount: number | null;
  total_support_cost: number | null;
  note: string | null;
  fee: number | null;
  profit_memo: string | null;
  status: string | null;
  dealer: string | null;
  finance_company: string | null;
  contract_date: string | null;
  customer_commitment_date: string | null;
  delivery_date: string | null;
  final_vehicle_price?: number | string | null;
  final_deposit_amount?: number | string | null;
  final_fee_amount?: number | string | null;
  final_delivery_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ExportProgressRow = {
  id: string;
  lead_id: string;
  stage: string;
  order_date: string | null;
  vehicle_model: string | null;
  trim: string | null;
  options: string | null;
  color: string | null;
  dealer_name: string | null;
  dealer_staff_name: string | null;
  finance_company: string | null;
  vehicle_contract_number: string | null;
  customer_commitment_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  special_note: string | null;
  order_requested_at: string | null;
  order_completed_at: string | null;
  e_contract_started_at: string | null;
  e_contract_completed_at: string | null;
  delivery_coordinated_at: string | null;
  delivered_at: string | null;
  transport_company_received_at: string | null;
};

function counselingFieldsFromMemoOrRow(
  memo: string,
  c: ConsultationRow,
  row: LeadRow
): Omit<CounselingRecord, "id" | "occurredAt"> {
  if (memo.startsWith(CRM_CONSULTATION_MEMO_PREFIX)) {
    try {
      const p = JSON.parse(memo.slice(CRM_CONSULTATION_MEMO_PREFIX.length)) as {
        v?: number;
        counselor?: string;
        method?: string;
        importance?: string;
        reaction?: string;
        desiredProgressAt?: string;
        nextContactAt?: string;
        nextContactMemo?: string;
        content?: string;
      };
      if (p?.v === 1) {
        return {
          counselor: p.counselor ?? row.manager,
          method: coalesceConsultMethod(p.method),
          content: p.content ?? "",
          reaction: p.reaction ?? "",
          desiredProgressAt: p.desiredProgressAt ?? c.created_at,
          nextContactAt:
            p.nextContactAt ?? c.next_action_at ?? row.next_contact_at ?? c.created_at,
          nextContactMemo: p.nextContactMemo ?? "",
          importance: coalesceConsultImportance(p.importance),
        };
      }
    } catch {
      /* fall through: plain memo */
    }
  }
  return {
    counselor: c.counselor ?? row.manager,
    method: coalesceConsultMethod(c.method),
    content: memo,
    reaction: c.reaction ?? "",
    desiredProgressAt: c.desired_progress_at ?? c.next_action_at ?? c.created_at,
    nextContactAt: c.next_action_at ?? row.next_contact_at ?? c.created_at,
    nextContactMemo: c.next_contact_memo ?? "",
    importance: coalesceConsultImportance(c.importance),
  };
}

/** staff 저장 시 기존 상담 행의 담당자 문자열을 DB 내용 기준으로 복원 (메모 JSON 우선, 레거시는 counselor 컬럼·담당자 표시명) */
function readCounselorFromConsultationRow(
  memo: string,
  counselorCol: string | null | undefined,
  managerFallback: string
): string {
  const m = memo ?? "";
  if (m.startsWith(CRM_CONSULTATION_MEMO_PREFIX)) {
    try {
      const p = JSON.parse(m.slice(CRM_CONSULTATION_MEMO_PREFIX.length)) as {
        v?: number;
        counselor?: string;
      };
      if (p?.v === 1 && typeof p.counselor === "string") {
        const c = p.counselor.trim();
        if (c) return c;
      }
    } catch {
      /* fall through */
    }
  }
  const col = typeof counselorCol === "string" ? counselorCol.trim() : "";
  if (col) return col;
  return managerFallback.trim();
}

async function fetchPersistedCounselorByConsultationId(
  /** leads PK — trim 하지 않고 그대로 전달 */
  leadId: NonNullable<Lead["id"]>,
  managerFallback: string
): Promise<Map<string, string>> {
  ensureSupabaseConfigured();
  let res = await supabase.from("consultations").select("id, memo, counselor").eq("lead_id", leadId);
  if (res.error && unknownColumnFromPostgrestError(res.error) === "counselor") {
    const retry = await supabase.from("consultations").select("id, memo").eq("lead_id", leadId);
    res = retry as typeof res;
  }
  if (res.error) {
    throw new Error(formatSupabaseError(res.error));
  }
  const map = new Map<string, string>();
  for (const raw of res.data ?? []) {
    const row = raw as { id?: unknown; memo?: string | null; counselor?: string | null };
    const memo = typeof row.memo === "string" ? row.memo : "";
    if (parseLeadExtraMemo(memo)) continue;
    const id = counselingRecordIdKey(row.id);
    if (!id) continue;
    map.set(
      id,
      readCounselorFromConsultationRow(memo, row.counselor ?? null, managerFallback)
    );
  }
  return map;
}

function coalesceCustomerType(raw: string | undefined): CustomerType {
  if (raw === "법인" || raw === "개인사업자" || raw === "개인") return raw;
  return "개인";
}

function mapRowToLead(
  row: LeadRow,
  consultations: ConsultationRow[],
  contractRow: ContractRow | null,
  exportRow: ExportProgressRow | null
): Lead {
  const rowLeadId = coerceDbStringId(row.id);
  const forLead = consultations.filter((c) => coerceDbStringId(c.lead_id) === rowLeadId);
  let extraPayload: LeadExtraPayloadV1 | null = null;
  const visibleConsultations: ConsultationRow[] = [];
  for (const rowC of forLead) {
    const p = parseLeadExtraMemo(rowC.memo ?? "");
    if (p) {
      if (!extraPayload) extraPayload = p;
      continue;
    }
    visibleConsultations.push(rowC);
  }

  const records: CounselingRecord[] = visibleConsultations.map((c) => {
    const fields = counselingFieldsFromMemoOrRow(c.memo ?? "", c, row);
    return {
      id: coerceDbStringId(c.id),
      occurredAt: c.created_at,
      ...fields,
    };
  });

  const contract: ContractInfo | null = contractRow
    ? (() => {
        const depositDb = contractRow.deposit_or_prepayment ?? "";
        const noteRaw = contractRow.note ?? "";
        const { userNote, extra: contractNoteExtra } = splitContractNote(noteRaw);
        const feeRaw = contractRow.fee;
        const feeNum =
          typeof feeRaw === "number"
            ? feeRaw
            : feeRaw != null
              ? Number(String(feeRaw).replace(/,/g, "").trim())
              : 0;
        const fee = Number.isFinite(feeNum) ? feeNum : 0;

        let draftContract: ContractInfo = {
          contractDate: contractRow.contract_date ?? row.created_at.slice(0, 10),
          customerCommitmentDate:
            contractRow.customer_commitment_date ?? row.created_at.slice(0, 10),
          product:
            contractRow.product === "운용리스" || contractRow.product === "금융리스"
              ? contractRow.product
              : "장기렌트",
          vehicleName: contractRow.vehicle_name ?? row.car_model,
          vehiclePrice: 0,
          monthlyPayment: contractRow.monthly_payment ?? 0,
          contractTerm: contractRow.contract_term ?? "36개월",
          depositAmount: 0,
          depositPercent: 0,
          depositOrPrepayment: depositDb,
          prepaymentSupportAmount: contractRow.customer_support_amount ?? 0,
          suppliesSupportContent: contractRow.supplies_support_content ?? "",
          suppliesSupportAmount: contractRow.supplies_support_amount ?? 0,
          totalSupportCost: contractRow.total_support_cost ?? 0,
          note: userNote,
          fee,
          feePercent: 0,
          profitMemo: contractRow.profit_memo ?? "",
          pickupPlannedAt: contractRow.delivery_date ?? row.created_at.slice(0, 10),
          deliveryType: "",
          finalVehiclePrice: coerceNumericForDb(contractRow.final_vehicle_price),
          finalDepositAmount: coerceNumericForDb(contractRow.final_deposit_amount),
          finalFeeAmount: coerceNumericForDb(contractRow.final_fee_amount),
          finalDeliveryType:
            contractRow.final_delivery_type === "대리점 출고" ||
            contractRow.final_delivery_type === "특판 출고"
              ? contractRow.final_delivery_type
              : null,
        };

        if (contractNoteExtra) {
          draftContract = applyContractExtraToInfo(draftContract, contractNoteExtra);
          const line = formatDepositDbLine(draftContract.depositAmount, draftContract.depositPercent);
          if (line) draftContract.depositOrPrepayment = line;
        } else {
          const leg = parseLegacyDepositLine(depositDb);
          draftContract.depositAmount = leg.amount;
          draftContract.depositPercent = leg.percent;
          const vp = draftContract.vehiclePrice;
          if (vp > 0 && draftContract.fee > 0)
            draftContract.feePercent = percentFromAmount(draftContract.fee, vp);
        }
        return draftContract;
      })()
    : null;

  const exportProgress: ExportProgress | null = exportRow
    ? {
        stage: (exportRow.stage as ExportProgress["stage"]) ?? "계약완료",
        orderDate: exportRow.order_date ?? undefined,
        vehicleModel: exportRow.vehicle_model ?? undefined,
        trim: exportRow.trim ?? undefined,
        options: exportRow.options ?? undefined,
        color: exportRow.color ?? undefined,
        dealerName: exportRow.dealer_name ?? undefined,
        dealerStaffName: exportRow.dealer_staff_name ?? undefined,
        financeCompany: exportRow.finance_company ?? undefined,
        vehicleContractNumber: exportRow.vehicle_contract_number ?? undefined,
        customerCommitmentDate: exportRow.customer_commitment_date ?? undefined,
        expectedDeliveryDate: exportRow.expected_delivery_date ?? undefined,
        actualDeliveryDate: exportRow.actual_delivery_date ?? null,
        specialNote: exportRow.special_note ?? undefined,
        orderRequestedAt: exportRow.order_requested_at ?? undefined,
        orderCompletedAt: exportRow.order_completed_at ?? undefined,
        eContractStartedAt: exportRow.e_contract_started_at ?? undefined,
        eContractCompletedAt: exportRow.e_contract_completed_at ?? undefined,
        deliveryCoordinatedAt: exportRow.delivery_coordinated_at ?? undefined,
        deliveredAt: exportRow.delivered_at ?? null,
        transportCompanyReceivedAt:
          exportRow.transport_company_received_at ?? undefined,
      }
    : null;

  const ext = extraPayload;
  const depositAmt =
    typeof ext?.depositOrPrepaymentAmount === "string" ? ext.depositOrPrepaymentAmount : "";
  const lead: Lead = {
    id: rowLeadId,
    managerUserId: nullableDbStringId(row.manager_user_id),
    createdAt: row.created_at,
    updatedAt: row.created_at,
    base: {
      name: row.name,
      phone: row.phone,
      desiredVehicle: row.car_model,
      source: row.source,
      leadTemperature:
        row.sensitivity === "상" || row.sensitivity === "하" ? row.sensitivity : "중",
      customerType: coalesceCustomerType(ext?.customerType),
      wantedMonthlyPayment:
        typeof ext?.wantedMonthlyPayment === "number" && Number.isFinite(ext.wantedMonthlyPayment)
          ? ext.wantedMonthlyPayment
          : 0,
      contractTerm: (ext?.contractTerm ?? "").trim() || "36개월",
      hasDepositOrPrepayment: !!(ext?.hasDepositOrPrepayment || depositAmt.trim().length > 0),
      depositOrPrepaymentAmount: depositAmt,
      ownerStaff: row.manager,
      memo: typeof ext?.memo === "string" ? ext.memo : "",
    },
    counselingStatus: normalizeCounselingStatus(row.status),
    statusUpdatedAt: row.created_at,
    nextContactAt: row.next_contact_at,
    nextContactMemo: "",
    counselingRecords: records,
    contract,
    exportProgress,
    deliveredAt: exportProgress?.deliveredAt ?? null,
    lastHandledAt: row.created_at,
    summaryText: (row.summary_text ?? "").trim() || "",
    nextAction: (row.next_action ?? "").trim() || "",
    customerIntent:
      row.customer_intent === "exploring" ||
      row.customer_intent === "interested" ||
      row.customer_intent === "closing"
        ? row.customer_intent
        : "",
    ...defaultLeadOperationalFields(),
    leadPriority: coalescePriority(ext?.leadPriority),
    failureReason: typeof ext?.failureReason === "string" ? ext.failureReason : "",
    failureReasonNote: typeof ext?.failureReasonNote === "string" ? ext.failureReasonNote : "",
    creditReviewStatus: coalesceCreditReview(ext?.creditReviewStatus),
    quoteHistory: normalizeQuoteHistory(ext?.quoteHistory),
  };
  return lead;
}

/** leads.next_contact_at: 빈 문자열은 null (timestamptz invalid input 방지) */
function normalizeNextContactAtForLeadColumn(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toLeadInsertRow(lead: Lead) {
  return {
    name: lead.base.name,
    phone: lead.base.phone,
    car_model: lead.base.desiredVehicle,
    source: lead.base.source,
    status: lead.counselingStatus,
    sensitivity: lead.base.leadTemperature,
    manager: lead.base.ownerStaff,
    manager_user_id: nullableDbStringId(lead.managerUserId),
    next_contact_at: normalizeNextContactAtForLeadColumn(lead.nextContactAt),
    created_at: lead.createdAt,
  };
}

function toLeadUpdateRow(lead: Lead) {
  return {
    name: lead.base.name,
    phone: lead.base.phone,
    car_model: lead.base.desiredVehicle,
    source: lead.base.source,
    status: lead.counselingStatus,
    sensitivity: lead.base.leadTemperature,
    manager: lead.base.ownerStaff,
    manager_user_id: nullableDbStringId(lead.managerUserId),
    next_contact_at: normalizeNextContactAtForLeadColumn(lead.nextContactAt),
  };
}

type ConsultationInsert = {
  lead_id: string;
  memo: string;
  created_at: string;
  id?: string;
};

/** DB에 counselor 등 컬럼이 없어도 동작하도록 memo(CRM1 JSON) + 필수 컬럼만 insert */
/** Postgres `date` 컬럼: 빈 문자열/잘못된 값은 null (invalid input syntax 방지) */
function normalizeDateForPostgres(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const head = s.length >= 10 ? s.slice(0, 10) : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
  return head;
}

/** numeric 컬럼: 문자열·콤마 입력도 안전하게 숫자 또는 null */
function coerceNumericForDb(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toConsultationRows(lead: Lead): ConsultationInsert[] {
  const extraRow: ConsultationInsert = {
    lead_id: lead.id,
    memo: serializeLeadExtraMemo(lead),
    created_at: lead.createdAt,
  };
  const list = Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [];
  const rows = list.map((r) => {
    const row: ConsultationInsert = {
      lead_id: lead.id,
      memo: serializeConsultationToMemo(r),
      created_at: r.occurredAt,
    };
    if (isUuidString(r.id)) {
      row.id = coerceDbStringId(r.id);
    }
    return row;
  });
  return [extraRow, ...rows];
}

/** contracts INSERT 시 snake_case 컬럼 → UI/의미 (누락 경고용) */
const CONTRACT_DB_COLUMN_HINT: Record<string, string> = {
  lead_id: "시스템 · lead_id",
  product: "계약 탭 · 상품(운용리스/금융리스/장기렌트)",
  vehicle_name: "계약 탭 · 계약 차량명",
  monthly_payment: "계약 탭 · 월 납입금",
  contract_term: "계약 탭 · 계약기간",
  deposit_or_prepayment: "계약 탭 · 보증금/선납금(문자)",
  customer_support_amount: "계약 탭 · 선납금 지원금액",
  supplies_support_content: "계약 탭 · 용품지원 내용",
  supplies_support_amount: "계약 탭 · 용품지원 금액",
  total_support_cost: "계약 탭 · 총 지원 비용",
  note: "계약 탭 · 비고",
  fee: "계약 탭 · 수수료",
  profit_memo: "계약 탭 · 수익 메모",
  status: "상담결과(Lead) · contracts.status 스냅샷",
  dealer: "출고 탭 · 대리점명 → contracts.dealer",
  finance_company: "출고 탭 · 금융사 → contracts.finance_company",
  contract_date: "계약 탭 · 계약일",
  customer_commitment_date: "계약 탭 · 고객 약정일",
  delivery_date:
    "인도예정: 출고 탭 인도 예정일 우선, 없을 때만 계약 탭 출고 예정일 → delivery_date",
  final_vehicle_price: "확정·출고 시 스냅샷 · 차량가",
  final_deposit_amount: "확정·출고 시 스냅샷 · 보증금",
  final_fee_amount: "확정·출고 시 스냅샷 · 수수료",
  final_delivery_type: "확정·출고 시 스냅샷 · 출고 유형",
};

function logContractDeliveryDateResolution(lead: Lead) {
  const c = lead.contract;
  if (!c) return;
  const fromExport = normalizeDateForPostgres(lead.exportProgress?.expectedDeliveryDate);
  const fromContract = normalizeDateForPostgres(c.pickupPlannedAt);
  const chosen = fromExport ?? fromContract ?? null;
  devLog("[Supabase] contracts delivery_date 결정 (성공 저장 시에도 값이 기대와 다를 수 있음)", {
    최종_delivery_date: chosen,
    출고탭_인도예정일: fromExport ?? null,
    계약탭_출고예정일_pickupPlannedAt: fromContract ?? null,
    안내:
      "출고 탭에 인도 예정일이 있으면 계약 탭 출고 예정일은 contracts.delivery_date에 쓰이지 않습니다.",
  });
}

function toContractRow(lead: Lead) {
  if (!lead.contract) return null;
  const c = lead.contract;
  const deliveryFromExport = normalizeDateForPostgres(lead.exportProgress?.expectedDeliveryDate);
  const deliveryFromContract = normalizeDateForPostgres(c.pickupPlannedAt);
  const product =
    c.product === "운용리스" || c.product === "금융리스" || c.product === "장기렌트"
      ? c.product
      : null;
  const builtExtra = buildContractExtraFromInfo(c);
  const extraForNote = shouldPersistContractExtra(builtExtra) ? builtExtra : null;
  const noteJoined = joinContractNote(c.note ?? "", extraForNote);
  const depLine =
    formatDepositDbLine(c.depositAmount ?? 0, c.depositPercent ?? 0) ||
    (c.depositOrPrepayment?.trim() || null);
  return {
    lead_id: lead.id,
    product,
    vehicle_name: c.vehicleName?.trim() || null,
    monthly_payment: coerceNumericForDb(c.monthlyPayment),
    contract_term: c.contractTerm?.trim() || null,
    deposit_or_prepayment: depLine,
    customer_support_amount: coerceNumericForDb(c.prepaymentSupportAmount),
    supplies_support_content: c.suppliesSupportContent?.trim() || null,
    supplies_support_amount: coerceNumericForDb(c.suppliesSupportAmount),
    total_support_cost: coerceNumericForDb(c.totalSupportCost),
    note: noteJoined.trim() || null,
    fee: coerceNumericForDb(c.fee),
    profit_memo: c.profitMemo?.trim() || null,
    status: lead.counselingStatus,
    dealer: lead.exportProgress?.dealerName?.trim() || null,
    finance_company: lead.exportProgress?.financeCompany?.trim() || null,
    contract_date: normalizeDateForPostgres(c.contractDate),
    customer_commitment_date: normalizeDateForPostgres(c.customerCommitmentDate),
    delivery_date: deliveryFromExport ?? deliveryFromContract ?? null,
  } as Record<string, unknown>;
}

function normalizeTimestamptzForDb(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function toExportRow(lead: Lead) {
  if (!lead.exportProgress) return null;
  const e = lead.exportProgress;
  const stage =
    typeof e.stage === "string" && e.stage.trim() ? e.stage.trim() : "계약완료";
  return {
    lead_id: lead.id,
    stage,
    order_date: normalizeDateForPostgres(e.orderDate),
    vehicle_model: e.vehicleModel?.trim() || null,
    trim: e.trim?.trim() || null,
    options: e.options?.trim() || null,
    color: e.color?.trim() || null,
    dealer_name: e.dealerName?.trim() || null,
    dealer_staff_name: e.dealerStaffName?.trim() || null,
    finance_company: e.financeCompany?.trim() || null,
    vehicle_contract_number: e.vehicleContractNumber?.trim() || null,
    customer_commitment_date: normalizeDateForPostgres(e.customerCommitmentDate),
    expected_delivery_date: normalizeDateForPostgres(e.expectedDeliveryDate),
    actual_delivery_date: normalizeDateForPostgres(e.actualDeliveryDate),
    special_note: e.specialNote?.trim() || null,
    order_requested_at: normalizeTimestamptzForDb(e.orderRequestedAt),
    order_completed_at: normalizeTimestamptzForDb(e.orderCompletedAt),
    e_contract_started_at: normalizeTimestamptzForDb(e.eContractStartedAt),
    e_contract_completed_at: normalizeTimestamptzForDb(e.eContractCompletedAt),
    delivery_coordinated_at: normalizeTimestamptzForDb(e.deliveryCoordinatedAt),
    delivered_at: normalizeTimestamptzForDb(e.deliveredAt),
    transport_company_received_at: normalizeTimestamptzForDb(e.transportCompanyReceivedAt),
  } as Record<string, unknown>;
}

/**
 * 원격 DB 스키마에 없는 컬럼이 있으면 PostgREST PGRST204가 납니다.
 * 마이그레이션 없이도 저장되도록 해당 키만 제거 후 재시도합니다.
 */
function unknownColumnFromPostgrestError(error: unknown): string | null {
  const e = error as { code?: string; message?: string };
  const msg = e.message ?? "";
  // 스키마에 없는 컬럼을 body에 넣었을 때 흔한 메시지 (코드는 PGRST204 등으로 올 수 있음)
  const m = msg.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  return m?.[1] ?? null;
}

async function insertRowOmittingUnknownColumns(
  table: "contracts" | "export_progress",
  row: Record<string, unknown>
): Promise<{ omitted: string[]; finalPayload: Record<string, unknown> }> {
  const omitted: string[] = [];
  let payload: Record<string, unknown> = { ...row };
  for (let attempt = 0; attempt < 24; attempt++) {
    devLog(`[Supabase] ${table} insert 시도 직전 body`, {
      키목록: Object.keys(payload),
      payload,
    });
    const { error } = await supabase.from(table).insert(payload as never);
    if (!error) {
      return { omitted, finalPayload: payload };
    }
    const col = unknownColumnFromPostgrestError(error);
    if (!col || !(col in payload)) throw error;
    const removedValue = payload[col];
    omitted.push(col);
    console.warn(
      `[Supabase] ${table} insert: 컬럼 '${col}' 은(는) 원격 스키마에 없어 body에서 제거 후 재시도`,
      { 제거된값: removedValue, postgrestMessage: (error as { message?: string }).message }
    );
    const next = { ...payload };
    delete next[col];
    payload = next;
  }
  throw new Error(`[Supabase] ${table} insert: 반복 실패(알 수 없는 컬럼)`);
}

function isRelationTableUnavailableError(error: unknown): boolean {
  const msg = formatSupabaseError(error).toLowerCase();
  return (
    msg.includes("consultations") ||
    msg.includes("contracts") ||
    msg.includes("export_progress") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("pgrst205") ||
    msg.includes("42p01")
  );
}

async function fetchLeadRelationsByIds(leadIds: string[]): Promise<{
  consultations: ConsultationRow[];
  contracts: ContractRow[];
  exportRows: ExportProgressRow[];
}> {
  const ids = [...new Set(leadIds.map((id) => coerceDbStringId(id)).filter(Boolean))];
  if (ids.length === 0) return { consultations: [], contracts: [], exportRows: [] };

  const [consultationsRes, contractsRes, exportRes] = await Promise.all([
    supabase.from("consultations").select("*").in("lead_id", ids),
    supabase
      .from("contracts")
      .select("*")
      .in("lead_id", ids)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false }),
    supabase.from("export_progress").select("*").in("lead_id", ids),
  ]);

  if (consultationsRes.error) {
    if (isRelationTableUnavailableError(consultationsRes.error)) {
      console.warn("[fetchLeadRelationsByIds] consultations unavailable", {
        reason: formatSupabaseError(consultationsRes.error),
      });
    } else {
      throw new Error(`상담 이력 조회 실패: ${formatSupabaseError(consultationsRes.error)}`);
    }
  }
  if (contractsRes.error) {
    if (isRelationTableUnavailableError(contractsRes.error)) {
      console.warn("[fetchLeadRelationsByIds] contracts unavailable", {
        reason: formatSupabaseError(contractsRes.error),
      });
    } else {
      throw new Error(`계약 정보 조회 실패: ${formatSupabaseError(contractsRes.error)}`);
    }
  }
  if (exportRes.error) {
    if (isRelationTableUnavailableError(exportRes.error)) {
      console.warn("[fetchLeadRelationsByIds] export_progress unavailable", {
        reason: formatSupabaseError(exportRes.error),
      });
    } else {
      throw new Error(`출고 정보 조회 실패: ${formatSupabaseError(exportRes.error)}`);
    }
  }

  const contractRows = ((contractsRes.data ?? []) as ContractRow[]).filter((r) =>
    ids.includes(coerceDbStringId(r.lead_id))
  );
  const latestContractByLead = new Map<string, ContractRow>();
  for (const row of contractRows) {
    const lid = coerceDbStringId(row.lead_id);
    if (!lid) continue;
    if (!latestContractByLead.has(lid)) latestContractByLead.set(lid, row);
  }
  const dedupedContracts = Array.from(latestContractByLead.values());
  const duplicateCount = contractRows.length - dedupedContracts.length;
  if (duplicateCount > 0) {
    console.warn("[fetchLeadRelationsByIds] duplicate contracts rows detected", {
      duplicateCount,
      leadIdsWithDuplicates: ids.filter((lid) => contractRows.filter((r) => coerceDbStringId(r.lead_id) === lid).length > 1),
    });
  }

  return {
    consultations: ((consultationsRes.data ?? []) as ConsultationRow[]).filter((r) =>
      ids.includes(coerceDbStringId(r.lead_id))
    ),
    contracts: dedupedContracts,
    exportRows: ((exportRes.data ?? []) as ExportProgressRow[]).filter((r) =>
      ids.includes(coerceDbStringId(r.lead_id))
    ),
  };
}

/** 일반 영업: 본인 `manager_user_id` 만. 관리자 운영 화면(`operationalFullAccess`)만 전체. */
export async function fetchLeads(scope?: ViewerScope): Promise<Lead[]> {
  ensureSupabaseConfigured();
  const queryMeta = {
    table: "leads",
    order: "created_at desc",
    scopeRole: scope?.role ?? "all",
    scopeUserId: scope?.userId ?? null,
    operationalFullAccess: hasOperationalFullAccess(scope),
  };
  let query = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (scope && shouldFilterLeadsByManager(scope)) {
    const uid = nonEmptyUserId(scope.userId);
    if (!uid) {
      console.warn("[fetchLeads] scope without userId — returning no rows");
      return [];
    }
    query = query.eq("manager_user_id", uid);
  }
  const { data: leadsData, error: leadsError } = await query;
  console.log("[fetchLeads] query result", {
    ...queryMeta,
    rowCount: leadsData?.length ?? 0,
    hasError: !!leadsError,
  });

  if (leadsError) {
    console.error("[fetchLeads] leads query failed(raw)", {
      ...queryMeta,
      code: leadsError.code,
      message: leadsError.message,
      details: leadsError.details,
      hint: leadsError.hint,
      raw: leadsError,
    });
    throw new Error(`고객 조회 실패: ${formatSupabaseError(leadsError)}`);
  }

  const leadRows = (leadsData ?? []) as LeadRow[];
  if (leadRows.length === 0) return [];
  const leadIds = leadRows.map((row) => coerceDbStringId(row.id));
  const { consultations, contracts, exportRows } = await fetchLeadRelationsByIds(leadIds);
  const contractByLeadId = new Map<string, ContractRow>();
  const exportByLeadId = new Map<string, ExportProgressRow>();
  for (const c of contracts) contractByLeadId.set(coerceDbStringId(c.lead_id), c);
  for (const e of exportRows) exportByLeadId.set(coerceDbStringId(e.lead_id), e);

  return leadRows.map((row) =>
    mapRowToLead(
      row,
      consultations,
      contractByLeadId.get(coerceDbStringId(row.id)) ?? null,
      exportByLeadId.get(coerceDbStringId(row.id)) ?? null
    )
  );
}

/** DB 컬럼은 `name`, `phone` (고객명 / 연락처). 표시·API용 별칭은 hit 객체 필드명으로 매핑합니다. */
export type LeadSearchHit = {
  id: string;
  /** 고객명 — DB `name` */
  customerName: string;
  phone: string;
  /** 상담결과 등 — DB `status` */
  status: string;
  /** 담당자 표시명 — DB `manager` */
  manager: string;
  /** 유입 — DB `source` */
  source: string;
};

function sanitizeLeadSearchKeyword(raw: string): string {
  return raw.trim().replace(/[%_,]/g, "").replace(/'/g, "");
}

/**
 * 고객명(`name`)·연락처(`phone`) ilike 검색.
 * 일반: 본인 담당만. 관리자 운영 전용 스코프만 전체.
 */
export async function searchLeads(
  keyword: string,
  scope?: LeadSupabaseScope
): Promise<LeadSearchHit[]> {
  ensureSupabaseConfigured();
  const q = sanitizeLeadSearchKeyword(keyword);
  if (q.length < 1) return [];

  const pattern = `%${q}%`;
  let query = supabase
    .from("leads")
    .select("id,name,phone,status,manager,source")
    .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (scope && shouldFilterLeadsByManager(scope)) {
    const uid = nonEmptyUserId(scope.userId);
    if (!uid) {
      console.warn("[searchLeads] scope without userId — returning no hits");
      return [];
    }
    query = query.eq("manager_user_id", uid);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[Supabase] searchLeads error:", error);
    throw new Error(`고객 검색 실패: ${formatSupabaseError(error)}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    manager: string;
    source: string;
  }>;
  return rows.map((r) => ({
    id: coerceDbStringId(r.id),
    customerName: r.name,
    phone: r.phone,
    status: r.status ?? "",
    manager: r.manager ?? "",
    source: r.source ?? "",
  }));
}

/** 단일 고객 조회. 일반: 본인 담당이 아니면 null. 관리자 운영 스코프만 제한 없음. */
export async function fetchLeadById(
  leadId: string,
  scope?: LeadSupabaseScope
): Promise<Lead | null> {
  ensureSupabaseConfigured();
  const idForQuery = coerceDbStringId(leadId);
  let q = supabase.from("leads").select("*").eq("id", idForQuery);
  if (scope && shouldFilterLeadsByManager(scope)) {
    const uid = nonEmptyUserId(scope.userId);
    if (!uid) {
      console.warn("[fetchLeadById] scope without userId — denying access");
      return null;
    }
    q = q.eq("manager_user_id", uid);
  }
  const { data: rowData, error: rowError } = await q.maybeSingle();
  if (rowError) {
    throw new Error(`고객 조회 실패: ${formatSupabaseError(rowError)}`);
  }
  const row = rowData as LeadRow | null;
  if (!row) return null;
  console.log("fetchLeadById raw row:", row);
  const rowLeadId = coerceDbStringId(row.id);
  const { consultations, contracts, exportRows } = await fetchLeadRelationsByIds([rowLeadId]);
  console.log("fetchLeadById contracts relation:", contracts[0] ?? null);
  return mapRowToLead(row, consultations, contracts[0] ?? null, exportRows[0] ?? null);
}

export async function createLead(lead: Lead, scope?: ViewerScope): Promise<Lead> {
  console.log("[createLead] start", lead);
  ensureSupabaseConfigured();
  const leadsTable = "leads";

  console.log("[createLead] before prepareLeadForSupabaseWrite");
  let leadForInsert: Lead;
  try {
    leadForInsert = await prepareLeadForSupabaseWrite(lead, scope);
  } catch (prepareErr) {
    console.error("[createLead] prepare failed", prepareErr);
    throw new Error("고객 저장 전 담당자 정보 준비 중 오류가 발생했습니다.");
  }
  console.log("[createLead] after prepareLeadForSupabaseWrite", leadForInsert);

  const payload = toLeadInsertRow(leadForInsert);
  console.log("[Supabase] createLead target table", leadsTable);
  devLog("[Supabase] leads insert payload:", payload);
  console.log("[Supabase] leads insert payload(full)", payload);
  const { data, error } = await supabase
    .from(leadsTable)
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    const e = error as { code?: string; message?: string; details?: string; hint?: string };
    console.error("[Supabase] leads insert error(full)", {
      code: e.code ?? null,
      message: e.message ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
      payload,
      raw: error,
    });
    throw new Error(
      [
        "고객 저장 실패",
        `error.code: ${e.code ?? "-"}`,
        `error.message: ${e.message ?? "-"}`,
        `error.details: ${e.details ?? "-"}`,
        `error.hint: ${e.hint ?? "-"}`,
        `insert payload: ${JSON.stringify(payload)}`,
      ].join("\n")
    );
  }

  const insertedRow = data as LeadRow;
  console.log("[createLead] after leads insert success", insertedRow);

  const createdLead: Lead = {
    ...leadForInsert,
    id: coerceDbStringId(insertedRow.id),
    createdAt: insertedRow.created_at,
    updatedAt: insertedRow.created_at,
    statusUpdatedAt: insertedRow.created_at,
    lastHandledAt: insertedRow.created_at,
  };

  console.log("[createLead] returning createdLead", createdLead);

  // logActivity / logStatusHistory 미호출 — crm_activity_logs·lead_status_history 요청 없음(leads insert만).
  return createdLead;
}

export async function updateLead(lead: Lead, scope?: ViewerScope) {
  ensureSupabaseConfigured();
  const filterByManager = shouldFilterLeadsByManager(scope);
  const scopeUid = nonEmptyUserId(scope?.userId) ?? "";
  if (filterByManager) {
    if (!scopeUid) {
      throw new Error("계정 식별 정보가 없습니다. 다시 로그인해 주세요.");
    }
    const { data: ownerRow, error: ownerErr } = await supabase
      .from("leads")
      .select("manager_user_id")
      .eq("id", coerceDbStringId(lead.id))
      .maybeSingle();
    if (ownerErr) throw new Error(`담당 권한 확인 실패: ${formatSupabaseError(ownerErr)}`);
    const dbManager = (ownerRow as { manager_user_id: string | null } | null)?.manager_user_id;
    if (dbManager != null && dbManager !== scopeUid) {
      throw new Error("본인 담당 고객만 수정할 수 있습니다.");
    }
  }
  const leadLocked = await prepareLeadForSupabaseWrite(lead, scope);
  const leadForUpdate = normalizeLeadForPersistence(leadLocked);
  if (!coerceDbStringId(leadForUpdate.id)) {
    throw new Error("leadId 없음");
  }

  const payload = toLeadUpdateRow(leadForUpdate);
  devLog("[Supabase] leads update payload (계약 탭 필드는 포함되지 않음):", payload);
  let updateQuery = supabase.from("leads").update(payload).eq("id", leadForUpdate.id);
  if (filterByManager && scopeUid) {
    updateQuery = updateQuery.eq("manager_user_id", scopeUid);
  }
  const { error } = await updateQuery;
  if (error) {
    console.error("[Supabase] leads update error:", error, {
      leadId: leadForUpdate.id,
      counselingStatus: leadForUpdate.counselingStatus,
      leadsTablePayload: payload,
    });
    throw new Error(`고객 수정 실패: ${formatSupabaseError(error)}`);
  }

  const contractPayload = toContractRow(leadForUpdate);
  console.log("contract payload:", {
    lead_id: leadForUpdate.id,
    commission: contractPayload?.fee ?? null,
    commission_rate: leadForUpdate.contract?.feePercent ?? null,
    fee: contractPayload?.fee ?? null,
    contract_date: contractPayload?.contract_date ?? null,
    delivered_at: leadForUpdate.exportProgress?.deliveredAt ?? leadForUpdate.deliveredAt ?? null,
    category: null,
    customer_stage: leadForUpdate.counselingStatus,
    consultation_result: leadForUpdate.counselingStatus,
  });

  try {
    await replaceLeadRelations(leadForUpdate);
  } catch (relError) {
    if (isRelationTableUnavailableError(relError)) {
      console.warn("[updateLead] relation table unavailable; kept leads update only", {
        leadId: leadForUpdate.id,
        reason: formatSupabaseError(relError),
      });
      return;
    }
    throw relError;
  }
}

export async function deleteLead(leadId: string, scope?: ViewerScope) {
  ensureSupabaseConfigured();
  const idForDelete = coerceDbStringId(leadId);
  if (shouldFilterLeadsByManager(scope)) {
    const uid = nonEmptyUserId(scope?.userId);
    if (!uid) {
      throw new Error("계정 식별 정보가 없습니다. 다시 로그인해 주세요.");
    }
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("id", idForDelete)
      .eq("manager_user_id", uid)
      .maybeSingle();
    if (error) throw new Error(`삭제 권한 확인 실패: ${formatSupabaseError(error)}`);
    if (!data) throw new Error("본인 담당 고객만 삭제할 수 있습니다.");
  }
  await Promise.all([
    supabase.from("consultations").delete().eq("lead_id", idForDelete),
    supabase.from("contracts").delete().eq("lead_id", idForDelete),
  ]);
  const { error } = await supabase.from("leads").delete().eq("id", idForDelete);
  if (error) {
    console.error("[Supabase] leads delete error:", error, "leadId:", leadId);
    throw new Error(`고객 삭제 실패: ${formatSupabaseError(error)}`);
  }
}

function parseFeeWonFromDb(feeRaw: unknown, finalRaw: unknown): number {
  const tryNum = (v: unknown) => {
    if (v == null) return NaN;
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : NaN;
  };
  const fromFinal = tryNum(finalRaw);
  if (Number.isFinite(fromFinal)) return fromFinal;
  const fromFee = tryNum(feeRaw);
  return Number.isFinite(fromFee) ? fromFee : 0;
}

/**
 * 직원 현황·엑셀용: lead_id별 계약 수수료·계약일(스냅샷 수수료 우선).
 * contracts 테이블이 없거나 오류 시 빈 Map.
 */
export async function fetchContractFeeSummaryByLeadIds(
  leadIds: string[],
  scope: ViewerScope
): Promise<Map<string, { feeWon: number; contractDate: string }>> {
  assertAdminOperationalScope(scope, "계약 수수료 요약 조회");
  const out = new Map<string, { feeWon: number; contractDate: string }>();
  if (leadIds.length === 0) return out;
  ensureSupabaseConfigured();
  const ids = [...new Set(leadIds.map((id) => coerceDbStringId(id)).filter(Boolean))];
  const chunkSize = 150;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("contracts")
      .select("lead_id,fee,final_fee_amount,contract_date")
      .in("lead_id", chunk);
    if (error) {
      console.warn("[fetchContractFeeSummaryByLeadIds] skip chunk", formatSupabaseError(error));
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        lead_id: string;
        fee?: unknown;
        final_fee_amount?: unknown;
        contract_date?: string | null;
      };
      const lid = coerceDbStringId(r.lead_id);
      if (!lid) continue;
      const feeWon = parseFeeWonFromDb(r.fee, r.final_fee_amount);
      const contractDate = String(r.contract_date ?? "").trim().slice(0, 10);
      out.set(lid, { feeWon, contractDate });
    }
  }
  return out;
}

/** lead_id별 상담기록 최신 created_at (consultations 없으면 빈 Map). */
export async function fetchMaxConsultationCreatedAtByLeadIds(
  leadIds: string[],
  scope: ViewerScope
): Promise<Map<string, string>> {
  assertAdminOperationalScope(scope, "상담기록 일시 조회");
  const out = new Map<string, string>();
  if (leadIds.length === 0) return out;
  ensureSupabaseConfigured();
  const ids = [...new Set(leadIds.map((id) => coerceDbStringId(id)).filter(Boolean))];
  const chunkSize = 150;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("consultations")
      .select("lead_id,created_at")
      .in("lead_id", chunk);
    if (error) {
      console.warn(
        "[fetchMaxConsultationCreatedAtByLeadIds] skip chunk",
        formatSupabaseError(error)
      );
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { lead_id: string; created_at: string };
      const lid = coerceDbStringId(r.lead_id);
      if (!lid) continue;
      const ca = String(r.created_at ?? "");
      const prev = out.get(lid);
      if (!prev || ca > prev) out.set(lid, ca);
    }
  }
  return out;
}

async function replaceLeadRelations(lead: Lead) {
  const leadId = coerceDbStringId(lead.id);
  if (!leadId) throw new Error("leadId 없음");
  await Promise.all([
    supabase.from("consultations").delete().eq("lead_id", leadId),
    supabase.from("export_progress").delete().eq("lead_id", leadId),
  ]);

  const consultations = toConsultationRows(lead);
  if (consultations.length > 0) {
    const { error: cErr } = await supabase.from("consultations").insert(consultations);
    if (cErr) {
      console.error("[Supabase] consultations insert failed", {
        leadId: lead.id,
        counselingStatus: lead.counselingStatus,
        rowCount: consultations.length,
        firstRow: consultations[0],
        error: cErr,
      });
      throw cErr;
    }
  }

  const contract = toContractRow(lead);
  if (contract) {
    logContractDeliveryDateResolution(lead);
    const cleanPayload = Object.fromEntries(
      Object.entries(contract).filter(([, v]) => v !== undefined && v !== null)
    );
    console.log("=== 계약고객 저장 시작 ===");
    console.log("leadId:", leadId);
    console.log("raw payload:", contract);
    console.log("cleanPayload:", cleanPayload);
    console.log("update payload:", cleanPayload);
    devLog("[Supabase] contracts UPDATE 의도 payload (cleanPayload)", cleanPayload);
    try {
      const { data: existingRows, error: existingErr } = await supabase
        .from("contracts")
        .select("id, created_at, updated_at")
        .eq("lead_id", leadId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false });
      if (existingErr) throw existingErr;
      const rows = (existingRows ?? []) as Array<{ id: string; created_at?: string | null; updated_at?: string | null }>;
      if (rows.length > 1) {
        console.warn("[contracts] duplicate rows for lead_id", { leadId, rowCount: rows.length, rowIds: rows.map((r) => r.id) });
      }
      const target = rows[0] ?? null;
      if (target) {
        const { data: updateData, error: updateErr } = await supabase
          .from("contracts")
          .update(cleanPayload)
          .eq("id", target.id)
          .select("id, lead_id, fee, contract_date, status")
          .maybeSingle();
        console.log("contract update result:", updateData);
        if (updateErr) {
          console.error("contract update error:", updateErr);
          throw updateErr;
        }
      }
      else {
        const { omitted, finalPayload } = await insertRowOmittingUnknownColumns("contracts", contract);
        devLog("[Supabase] contracts INSERT 실제 적용된 body (전송·저장됨)", finalPayload);
        if (omitted.length > 0) {
          const 누락값요약 = Object.fromEntries(omitted.map((k) => [k, contract[k]]));
          console.warn(
            "[계약 저장] INSERT는 성공했으나 원격 DB에 없는 컬럼은 저장되지 않았습니다. 재조회 시 해당 값이 비거나 기본값으로 보일 수 있습니다.",
            {
              제외된_DB_컬럼: omitted,
              CRM_필드_안내: omitted.map((k) => CONTRACT_DB_COLUMN_HINT[k] ?? k),
              제외직전_의도값: 누락값요약,
            }
          );
        }
        const { data: insertedRow, error: insertedReadErr } = await supabase
          .from("contracts")
          .select("id, lead_id, fee, contract_date, status")
          .eq("lead_id", leadId)
          .maybeSingle();
        if (insertedReadErr) {
          console.error("contract update error:", insertedReadErr);
        }
        console.log("contract update result:", insertedRow);
      }
      const { data: contractsRowsAfterWrite, error: contractsRowsAfterWriteErr } = await supabase
        .from("contracts")
        .select("*")
        .eq("lead_id", leadId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false });
      if (contractsRowsAfterWriteErr) {
        console.error("contract update error:", contractsRowsAfterWriteErr);
        throw contractsRowsAfterWriteErr;
      }
      const afterRows = (contractsRowsAfterWrite ?? []) as ContractRow[];
      console.log("contracts direct refetch after save:", afterRows);
      if (afterRows.length === 0) {
        throw new Error("계약 저장 검증 실패: 저장 후 contracts row가 없습니다.");
      }
    } catch (kErr) {
      console.error("계약 저장 오류", kErr, contract);
      throw kErr;
    }
  }
  const exportProgress = toExportRow(lead);
  if (exportProgress) {
    devLog("[Supabase] export_progress INSERT 의도 payload (전체)", exportProgress);
    try {
      const { omitted, finalPayload } = await insertRowOmittingUnknownColumns(
        "export_progress",
        exportProgress
      );
      devLog("[Supabase] export_progress INSERT 실제 적용된 body", finalPayload);
      if (omitted.length > 0) {
        console.warn("[출고 저장] INSERT 성공 · DB에 없어 제외된 컬럼", {
          제외된_DB_컬럼: omitted,
          제외직전_의도값: Object.fromEntries(omitted.map((k) => [k, exportProgress[k]])),
        });
      }
    } catch (eErr) {
      console.error("출고 저장 오류", eErr, exportProgress);
      throw eErr;
    }
  }
}

export async function seedLeadsIfEmpty() {
  ensureSupabaseConfigured();
  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`초기 데이터 확인 실패: ${formatSupabaseError(error)}`);
  if ((count ?? 0) > 0) return;

  for (const lead of SEED_LEADS.slice(0, 10)) {
    await createLead(lead);
  }
}

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  is_active: boolean;
  is_pinned?: boolean | null;
  is_important?: boolean | null;
};

function mapNoticeRow(row: NoticeRow): Notice {
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    isActive: row.is_active === true,
    isPinned: row.is_pinned === true,
    isImportant: row.is_important === true,
  };
}

function isNoticesUnavailableError(error: unknown): boolean {
  const msg = formatSupabaseError(error).toLowerCase();
  return (
    msg.includes("notices") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("pgrst205") ||
    msg.includes("42p01")
  );
}

/** PostgREST 스키마 캐시가 DB보다 늦게 갱신될 때 나는 오류에 안내를 붙입니다. */
function formatNoticeMutationError(error: unknown): string {
  const base = formatSupabaseError(error);
  const lower = base.toLowerCase();
  if (lower.includes("schema cache") || lower.includes("could not find the '")) {
    return `${base} — DB에 컬럼이 있는데도 동일하면 Supabase SQL에서 notify pgrst, 'reload schema'; 실행 후 재시도하세요. (.env의 프로젝트 URL과 SQL을 실행한 프로젝트가 같은지도 확인)`;
  }
  return base;
}

const NOTICE_SELECT =
  "id, title, content, created_by, created_at, is_active, is_pinned, is_important";

/** 공지 조회: 고정·중요·최신순 */
export async function listNotices(limit = 5): Promise<Notice[]> {
  ensureSupabaseConfigured();
  const lim = Math.min(Math.max(limit, 1), 200);
  const { data, error } = await supabase
    .from("notices")
    .select(NOTICE_SELECT)
    .order("is_pinned", { ascending: false })
    .order("is_important", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) {
    if (isNoticesUnavailableError(error)) {
      console.warn("[Supabase] notices:", formatSupabaseError(error));
      return [];
    }
    throw new Error(`공지 조회 실패: ${formatSupabaseError(error)}`);
  }
  return ((data ?? []) as NoticeRow[]).map(mapNoticeRow).filter((n) => n.isActive);
}

export async function fetchNoticeById(id: string): Promise<Notice | null> {
  ensureSupabaseConfigured();
  const { data, error } = await supabase
    .from("notices")
    .select(NOTICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isNoticesUnavailableError(error)) {
      console.warn("[Supabase] fetchNoticeById:", formatSupabaseError(error));
      return null;
    }
    throw new Error(`공지 조회 실패: ${formatSupabaseError(error)}`);
  }
  if (!data) return null;
  const n = mapNoticeRow(data as NoticeRow);
  return n.isActive ? n : null;
}

export async function createNotice(input: {
  title: string;
  content: string;
  createdBy: string;
  isPinned?: boolean;
  isImportant?: boolean;
}): Promise<Notice> {
  ensureSupabaseConfigured();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  const { data, error } = await supabase
    .from("notices")
    .insert({
      title,
      content,
      created_by: input.createdBy,
      is_active: true,
      is_pinned: input.isPinned === true,
      is_important: input.isImportant === true,
    })
    .select(NOTICE_SELECT)
    .single();
  if (error) throw new Error(`공지 등록 실패: ${formatNoticeMutationError(error)}`);
  return mapNoticeRow(data as NoticeRow);
}

export async function updateNotice(
  id: string,
  patch: {
    title?: string;
    content?: string;
    isActive?: boolean;
    isPinned?: boolean;
    isImportant?: boolean;
  }
): Promise<Notice> {
  ensureSupabaseConfigured();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.content !== undefined) row.content = patch.content.trim();
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.isPinned !== undefined) row.is_pinned = patch.isPinned;
  if (patch.isImportant !== undefined) row.is_important = patch.isImportant;
  if (Object.keys(row).length === 0) {
    const { data, error } = await supabase.from("notices").select(NOTICE_SELECT).eq("id", id).single();
    if (error) throw new Error(`공지 조회 실패: ${formatSupabaseError(error)}`);
    return mapNoticeRow(data as NoticeRow);
  }
  const { data, error } = await supabase
    .from("notices")
    .update(row)
    .eq("id", id)
    .select(NOTICE_SELECT)
    .single();
  if (error) throw new Error(`공지 수정 실패: ${formatNoticeMutationError(error)}`);
  return mapNoticeRow(data as NoticeRow);
}

export async function deleteNotice(id: string): Promise<void> {
  ensureSupabaseConfigured();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw new Error(`공지 삭제 실패: ${formatSupabaseError(error)}`);
}

