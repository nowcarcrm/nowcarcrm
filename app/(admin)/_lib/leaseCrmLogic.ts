import { effectiveContractNetProfitForMetrics } from "./leaseCrmContractPersist";
import type {
  CounselingStatus,
  ExportProgress,
  ExportStage,
  Lead,
  LeadCategoryKey,
} from "./leaseCrmTypes";

/**
 * 상담기록이 1건 이상일 때만: occurredAt 최신 기준으로 다음 연락일·메모를 leads 스냅샷에 반영.
 * 기록이 비어 있으면 기존 `lead.nextContactAt` 유지(목록 등 부분 로드 시 DB 값 보존).
 */
export function applyNextContactSnapshotFromRecords(lead: Lead): Lead {
  const records = lead.counselingRecords;
  if (!Array.isArray(records) || records.length === 0) {
    return lead;
  }
  const sorted = [...records].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const latest = sorted[0];
  if (!latest) return lead;
  const atRaw = latest.nextContactAt?.trim() ?? "";
  const memo = (latest.nextContactMemo ?? "").trim();
  if (!atRaw) {
    return { ...lead, nextContactAt: null, nextContactMemo: memo };
  }
  const parsed = Date.parse(atRaw);
  const nextContactAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  return { ...lead, nextContactAt, nextContactMemo: memo };
}

/** 계약·출고 파이프라인(계약 진행 고객 등)에 포함되는 상담결과 */
export function isContractPipelineCounselingStatus(s: CounselingStatus): boolean {
  return s === "계약완료" || s === "확정" || s === "출고" || s === "인도완료";
}

const LEAD_CATEGORY_PATH: Record<LeadCategoryKey, string> = {
  "new-db": "/leads/new-db",
  "counseling-progress": "/leads/counseling-progress",
  "follow-up": "/leads/follow-up",
  "unresponsive": "/leads/unresponsive",
  "quote-sent": "/leads/quote-sent",
  "contract-progress": "/leads/contract-progress",
  "export-progress": "/leads/contract-progress",
  "delivery-complete": "/leads/delivery-complete",
  aftercare: "/leads/aftercare",
  hold: "/leads/hold",
  cancel: "/leads/cancel",
};

/**
 * 상담결과(저장값) → 좌측 단계(LeadCategoryKey) 단일 매핑.
 * 목록 경로·저장 후 이동에 공통 사용.
 */
export function resolveLeadStageKeyFromCounselingResult(result: CounselingStatus): LeadCategoryKey {
  switch (result) {
    case "신규":
      return "new-db";
    case "상담중":
      return "counseling-progress";
    case "부재":
      return "unresponsive";
    case "계약완료":
    case "확정":
      return "contract-progress";
    case "출고":
      return "contract-progress";
    case "인도완료":
      return "delivery-complete";
    case "보류":
      return "hold";
    case "취소":
      return "cancel";
    default:
      return "counseling-progress";
  }
}

/** 상담결과 → 좌측 메뉴 카테고리 키 (목록/상세/상담기록 저장 후 이동 공통) */
export const getLeadCategoryKeyFromConsultResult = resolveLeadStageKeyFromCounselingResult;

/** 상담결과 저장 직후 이동할 고객 목록 경로 */
export function leadListPathAfterCounselingStatusChange(result: CounselingStatus): string {
  return LEAD_CATEGORY_PATH[resolveLeadStageKeyFromCounselingResult(result)];
}

const PATH_TO_LEAD_CATEGORY: Record<string, LeadCategoryKey> = Object.fromEntries(
  (Object.entries(LEAD_CATEGORY_PATH) as [LeadCategoryKey, string][]).map(([k, p]) => [p, k])
) as Record<string, LeadCategoryKey>;

/** 현재 URL → 좌측 진행단계 키 (글로벌 검색 등에서 상담결과 저장 후 이동용) */
export function leadCategoryKeyFromPathname(pathname: string | null | undefined): LeadCategoryKey | null {
  if (!pathname) return null;
  const base = pathname.split("?")[0].replace(/\/$/, "") || pathname;
  return PATH_TO_LEAD_CATEGORY[base] ?? null;
}

/**
 * 상담결과 저장 후 이동할 목록 경로 (항상 해당 단계로 이동).
 * 두 번째 인자는 시그니처 호환용으로 무시됩니다.
 */
export function pathnameAfterCounselingStatusChange(
  result: CounselingStatus,
  _currentCategoryKey?: LeadCategoryKey | null
): string {
  return leadListPathAfterCounselingStatusChange(result);
}

export type LeadCategoryBootstrap = Pick<
  Lead,
  | "counselingStatus"
  | "nextContactAt"
  | "nextContactMemo"
  | "exportProgress"
  | "contract"
  | "deliveredAt"
>;

function minimalExport(stage: ExportStage, extra: Partial<ExportProgress> = {}): ExportProgress {
  return {
    stage,
    orderDate: "",
    vehicleModel: "",
    trim: "",
    options: "",
    color: "",
    dealerName: "",
    dealerStaffName: "",
    financeCompany: "",
    vehicleContractNumber: "",
    customerCommitmentDate: "",
    expectedDeliveryDate: "",
    actualDeliveryDate: null,
    specialNote: "",
    deliveredAt: null,
    ...extra,
  };
}

/** 왼쪽 메뉴 카테고리에 맞춰 신규 고객 생성 시 초기 상태(상담결과·출고 단계 등) */
export function leadBootstrapForCategory(
  categoryKey: LeadCategoryKey,
  nowIso: string
): LeadCategoryBootstrap {
  const deliveredPast = new Date(Date.now() - 91 * MS_DAY).toISOString();
  switch (categoryKey) {
    case "new-db":
      return {
        counselingStatus: "신규",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    case "counseling-progress":
    case "quote-sent":
      return {
        counselingStatus: "상담중",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    case "follow-up":
      return {
        counselingStatus: "상담중",
        nextContactAt: nowIso,
        nextContactMemo: "재연락 예정(등록)",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    case "unresponsive":
      return {
        counselingStatus: "부재",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    case "contract-progress":
      return {
        counselingStatus: "계약완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("계약완료"),
        contract: null,
        deliveredAt: null,
      };
    case "export-progress":
      return {
        counselingStatus: "출고",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("발주 요청"),
        contract: null,
        deliveredAt: null,
      };
    case "delivery-complete":
      return {
        counselingStatus: "인도완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("인도 완료", { deliveredAt: nowIso }),
        contract: null,
        deliveredAt: nowIso,
      };
    case "aftercare":
      return {
        counselingStatus: "인도완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("인도 완료", { deliveredAt: deliveredPast }),
        contract: null,
        deliveredAt: deliveredPast,
      };
    case "hold":
      return {
        counselingStatus: "보류",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    case "cancel":
      return {
        counselingStatus: "취소",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
    default:
      return {
        counselingStatus: "신규",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: null,
        contract: null,
        deliveredAt: null,
      };
  }
}

const MS_DAY = 1000 * 60 * 60 * 24;

export function toLocalDateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameDate(isoA: string, isoB: string) {
  return toLocalDateKey(isoA) === toLocalDateKey(isoB);
}

export function isToday(iso: string) {
  return toLocalDateKey(iso) === toLocalDateKey(new Date().toISOString());
}

export function daysAgo(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - t) / MS_DAY);
}

/** 정렬·대시보드용: 상담기록 최신 occurredAt → lastHandledAt → nextContactAt → createdAt */
export function lastContactReferenceIso(lead: Lead): string {
  let maxIso = "";
  const recs = Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [];
  for (const r of recs) {
    if (r.occurredAt > maxIso) maxIso = r.occurredAt;
  }
  if (lead.lastHandledAt > maxIso) maxIso = lead.lastHandledAt;
  if (!maxIso && lead.nextContactAt) maxIso = lead.nextContactAt;
  if (!maxIso) maxIso = lead.createdAt;
  return maxIso;
}

function compareIsoAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 홈 대시보드 파이프라인(진행 단계 메뉴와 동일 규칙) */
export function computePipelineStageCounts(leads: Lead[]) {
  return {
    newDb: computeCategory(leads, "new-db").length,
    counseling: computeCategory(leads, "counseling-progress").length,
    contract: computeCategory(leads, "contract-progress").length,
    exportProgress: computeCategory(leads, "export-progress").length,
    deliveryComplete: computeCategory(leads, "delivery-complete").length,
    hold: computeCategory(leads, "hold").length,
    cancel: computeCategory(leads, "cancel").length,
    unresponsive: computeCategory(leads, "unresponsive").length,
    total: leads.length,
  };
}

/** 오늘 연락 예정(nextContactAt이 오늘) */
export function pickTodayContactLeads(leads: Lead[], limit: number): Lead[] {
  return leads
    .filter((l) => !!l.nextContactAt && isToday(l.nextContactAt))
    .sort((a, b) => compareIsoAsc(a.nextContactAt!, b.nextContactAt!))
    .slice(0, Math.max(0, limit));
}

/** 부재(미응답) 중 연락 기준 시점이 오래된 순 */
export function pickStaleUnresponsiveLeads(leads: Lead[], limit: number): Lead[] {
  return leads
    .filter((l) => l.counselingStatus === "부재")
    .sort((a, b) => compareIsoAsc(lastContactReferenceIso(a), lastContactReferenceIso(b)))
    .slice(0, Math.max(0, limit));
}

/** 최근 등록 */
export function pickRecentLeads(leads: Lead[], limit: number): Lead[] {
  return [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, Math.max(0, limit));
}

/** 최근 상담 접점(기록·처리·연락일·등록일 기준 최신순) */
export function pickRecentCounselingLeads(leads: Lead[], limit: number): Lead[] {
  return [...leads]
    .sort((a, b) => (lastContactReferenceIso(a) < lastContactReferenceIso(b) ? 1 : -1))
    .slice(0, Math.max(0, limit));
}

function isAfterDays(iso: string, days: number) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return now - t >= days * MS_DAY;
}

function exportStageIndex(stage: ExportStage) {
  const order: ExportStage[] = [
    "계약완료",
    "발주 요청",
    "발주 완료",
    "전자약정 전",
    "전자약정 완료",
    "출문 요청",
    "탁송사 전달",
    "탁송사 입고",
    "인도 일정 조율",
    "인도 완료",
  ];
  return order.indexOf(stage);
}

/** 왼쪽 메뉴 = 진행단계(계약·출고 데이터 기준). 상담결과(counselingStatus)와 별도 규칙입니다. */
export function computeCategory(leads: Lead[], categoryKey: LeadCategoryKey): Lead[] {
  switch (categoryKey) {
    case "new-db":
      return leads.filter((l) => l.counselingStatus === "신규");
    case "counseling-progress":
    case "quote-sent":
      return leads.filter((l) => l.counselingStatus === "상담중");
    case "follow-up":
      return leads.filter((l) => l.counselingStatus === "상담중" && !!l.nextContactAt);
    case "unresponsive":
      return leads.filter((l) => l.counselingStatus === "부재");
    case "contract-progress":
      return leads.filter((l) => {
        if (l.counselingStatus === "출고" || l.counselingStatus === "인도완료") return false;
        return (
          isContractPipelineCounselingStatus(l.counselingStatus) &&
          (!l.exportProgress ||
            exportStageIndex(l.exportProgress.stage) < exportStageIndex("인도 완료"))
        );
      });
    case "export-progress":
      return leads.filter((l) => {
        const stage = l.exportProgress?.stage;
        const deliveredDone =
          stage === "인도 완료" || !!l.deliveredAt || l.counselingStatus === "인도완료";
        if (deliveredDone) return false;
        const inExportBand =
          !!l.exportProgress &&
          stage != null &&
          exportStageIndex(stage) >= exportStageIndex("발주 요청") &&
          exportStageIndex(stage) < exportStageIndex("인도 완료");
        const byStatus = l.counselingStatus === "출고";
        return inExportBand || byStatus;
      });
    case "delivery-complete":
      return leads.filter(
        (l) =>
          l.counselingStatus === "인도완료" ||
          l.exportProgress?.stage === "인도 완료" ||
          !!l.deliveredAt
      );
    case "aftercare":
      return leads.filter((l) => {
        const delivered = l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt;
        if (!delivered) return false;
        if (!l.deliveredAt) return false;
        return isAfterDays(l.deliveredAt, 90);
      });
    case "hold":
      return leads.filter((l) => l.counselingStatus === "보류");
    case "cancel":
      return leads.filter((l) => l.counselingStatus === "취소");
    default:
      return [];
  }
}

/** 운영·직원 현황용 단일 stage (리드당 1개). `computeCategory` 우선순위와 동일. */
export type OperationalStageKey =
  | "new"
  | "active"
  | "missed"
  | "contract"
  | "delivery"
  | "delivered"
  | "hold"
  | "cancel";

export const OPERATIONAL_STAGE_LABEL_KO: Record<OperationalStageKey, string> = {
  new: "신규",
  active: "상담중",
  missed: "부재",
  contract: "계약",
  delivery: "출고",
  delivered: "인도완료",
  hold: "보류",
  cancel: "취소",
};

const OPERATIONAL_STAGE_PIPELINE_ORDER: LeadCategoryKey[] = [
  "cancel",
  "hold",
  "aftercare",
  "delivery-complete",
  "export-progress",
  "contract-progress",
  "unresponsive",
  "new-db",
  "counseling-progress",
  "follow-up",
  "quote-sent",
];

export function operationalStageKeyForLead(lead: Lead): OperationalStageKey {
  for (const cat of OPERATIONAL_STAGE_PIPELINE_ORDER) {
    if (computeCategory([lead], cat).length !== 1) continue;
    switch (cat) {
      case "cancel":
        return "cancel";
      case "hold":
        return "hold";
      case "aftercare":
      case "delivery-complete":
        return "delivered";
      case "export-progress":
        return "delivery";
      case "contract-progress":
        return "contract";
      case "unresponsive":
        return "missed";
      case "new-db":
        return "new";
      default:
        return "active";
    }
  }
  return "active";
}

export function operationalStageLabelForLead(lead: Lead): string {
  return OPERATIONAL_STAGE_LABEL_KO[operationalStageKeyForLead(lead)];
}

/**
 * 출고 저장 시 상담결과(진행단계와 구분). ExportStage 첫 단계명 `계약완료`와 혼동 주의.
 */
export function counselingStatusFromExportProgress(
  exp: ExportProgress | null,
  hasContract: boolean
): CounselingStatus {
  if (!exp) return hasContract ? "계약완료" : "상담중";
  if (exp.stage === "인도 완료") return "인도완료";
  return "계약완료";
}

/** 출고·인도 예정일이 N일 이내이고 아직 인도 완료 전 */
export function isDeliveryDueSoon(lead: Lead, withinDays = 7): boolean {
  if (!lead.exportProgress) return false;
  if (lead.exportProgress.stage === "인도 완료") return false;
  const raw =
    lead.exportProgress.expectedDeliveryDate ?? lead.contract?.pickupPlannedAt ?? "";
  const head = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return false;
  const t = new Date(`${head}T12:00:00`).getTime();
  const now = Date.now();
  const end = now + withinDays * MS_DAY;
  return t >= now && t <= end;
}

export function computeAutomationCounts(leads: Lead[]) {
  const todayFollowUp = leads.filter((l) => !!l.nextContactAt && isToday(l.nextContactAt)).length;
  const unprocessedNewDb = leads.filter((l) => {
    if (l.counselingStatus !== "신규") return false;
    return daysAgo(l.createdAt) >= 3;
  }).length;

  const abandoned7days = leads.filter((l) => {
    if (l.counselingStatus === "취소") return false;
    if (
      isContractPipelineCounselingStatus(l.counselingStatus) &&
      (l.exportProgress?.stage === "인도 완료" ||
        !!l.deliveredAt ||
        l.counselingStatus === "인도완료")
    ) {
      return false;
    }
    return daysAgo(l.lastHandledAt) >= 7;
  }).length;

  const afterDelivery3Months = leads.filter((l) => {
    const delivered = l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt;
    if (!delivered) return false;
    if (!l.deliveredAt) return false;
    return isAfterDays(l.deliveredAt, 90);
  }).length;

  const deliveryDueSoon = leads.filter((l) => isDeliveryDueSoon(l)).length;

  return {
    todayFollowUp,
    unprocessedNewDb,
    abandoned7days,
    afterDelivery3Months,
    deliveryDueSoon,
  };
}

export type StaffPipelineBreakdownRow = {
  staff: string;
  newDb: number;
  counseling: number;
  followUp: number;
  contractProgress: number;
  contractSigned: number;
  deliveryComplete: number;
};

/** 담당자별 파이프라인 건수 + 단계 간 전환율(참고용) */
export function computeStaffPipelineBreakdown(leads: Lead[]): StaffPipelineBreakdownRow[] {
  const m = new Map<string, StaffPipelineBreakdownRow>();
  function row(name: string): StaffPipelineBreakdownRow {
    const key = name.trim() || "미지정";
    if (!m.has(key)) {
      m.set(key, {
        staff: key,
        newDb: 0,
        counseling: 0,
        followUp: 0,
        contractProgress: 0,
        contractSigned: 0,
        deliveryComplete: 0,
      });
    }
    return m.get(key)!;
  }

  for (const l of leads) {
    const r = row(l.base.ownerStaff ?? "");
    if (l.counselingStatus === "신규") r.newDb += 1;
    if (l.counselingStatus === "상담중") {
      r.counseling += 1;
      if (l.nextContactAt) r.followUp += 1;
    }
    if (computeCategory([l], "contract-progress").length === 1) r.contractProgress += 1;
    if (isContractPipelineCounselingStatus(l.counselingStatus)) r.contractSigned += 1;
    if (l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt) r.deliveryComplete += 1;
  }

  return Array.from(m.values()).sort((a, b) => a.staff.localeCompare(b.staff, "ko"));
}

export type SourceFunnelRow = {
  source: string;
  total: number;
  contractProgress: number;
  contractSigned: number;
  deliveryComplete: number;
};

export function computeSourceFunnelMetrics(leads: Lead[]): SourceFunnelRow[] {
  const m = new Map<string, SourceFunnelRow>();
  function row(src: string): SourceFunnelRow {
    const key = src.trim() || "기타";
    if (!m.has(key)) {
      m.set(key, {
        source: key,
        total: 0,
        contractProgress: 0,
        contractSigned: 0,
        deliveryComplete: 0,
      });
    }
    return m.get(key)!;
  }

  for (const l of leads) {
    const r = row(l.base.source ?? "");
    r.total += 1;
    if (computeCategory([l], "contract-progress").length === 1) r.contractProgress += 1;
    if (isContractPipelineCounselingStatus(l.counselingStatus)) r.contractSigned += 1;
    if (l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt) r.deliveryComplete += 1;
  }

  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

export function computeDashboardMetrics(leads: Lead[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  const thisMonthKeyPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;

  const todayNewDb = leads.filter((l) => l.counselingStatus === "신규" && isToday(l.createdAt)).length;
  const todayCounselingCompleted = leads.filter(
    (l) => l.counselingStatus === "상담중" && isToday(l.statusUpdatedAt)
  ).length;
  const contractInProgress = leads.filter(
    (l) =>
      isContractPipelineCounselingStatus(l.counselingStatus) &&
      l.exportProgress?.stage !== "인도 완료" &&
      !l.deliveredAt &&
      l.counselingStatus !== "인도완료"
  ).length;
  const thisMonthContractCompleted = leads.filter(
    (l) =>
      isContractPipelineCounselingStatus(l.counselingStatus) &&
      toLocalDateKey(l.statusUpdatedAt).startsWith(thisMonthKeyPrefix)
  ).length;

  const thisMonthExpectedFee = leads
    .filter((l) => {
      if (!l.contract) return false;
      return l.contract.contractDate.startsWith(thisMonthKeyPrefix);
    })
    .reduce((sum, l) => sum + effectiveContractNetProfitForMetrics(l.contract!), 0);

  /** 이번 달(로컬) 신규 등록 건수 */
  const thisMonthRegisteredCount = leads.filter((l) =>
    toLocalDateKey(l.createdAt).startsWith(thisMonthKeyPrefix)
  ).length;

  /**
   * 이번 달 매출수익: 계약 고객(contract) 수수료 기준으로 계약일(contractDate) 월 합산.
   * 견적 이력 수수료는 대시보드 집계에서 제외한다.
   */
  const thisMonthSalesRevenueWon = leads.reduce((sum, l) => {
    if (!isContractPipelineCounselingStatus(l.counselingStatus)) return sum;
    if (!l.contract) return sum;
    const contractDate = String(l.contract.contractDate ?? "").trim();
    if (!contractDate) return sum;
    if (!toLocalDateKey(contractDate).startsWith(thisMonthKeyPrefix)) return sum;
    const fee = effectiveContractNetProfitForMetrics(l.contract);
    return sum + fee;
  }, 0);

  const commissionSourceRows = leads
    .filter((l) => !!l.contract)
    .map((l) => ({
      leadId: l.id,
      status: l.counselingStatus,
      contractDate: l.contract?.contractDate ?? "",
      fee: l.contract?.fee ?? 0,
      finalFeeAmount: l.contract?.finalFeeAmount ?? null,
    }));
  console.log("dashboard commission source rows:", commissionSourceRows);
  console.log("dashboard commission sum column:", "effectiveContractNetProfitForMetrics(contract)");
  console.log("dashboard date column:", "contract.contractDate (YYYY-MM)");
  console.log("dashboard computed result:", {
    thisMonthSalesRevenueWon,
  });

  const staff = new Map<
    string,
    { staff: string; counselingCount: number; contractCount: number }
  >();

  for (const l of leads) {
    const staffName = l.base.ownerStaff;
    if (!staff.has(staffName)) {
      staff.set(staffName, { staff: staffName, counselingCount: 0, contractCount: 0 });
    }
    const row = staff.get(staffName)!;
    if (
      l.counselingStatus === "상담중" ||
      l.counselingStatus === "보류" ||
      l.counselingStatus === "부재"
    ) {
      row.counselingCount += 1;
    }
    if (isContractPipelineCounselingStatus(l.counselingStatus)) {
      row.contractCount += 1;
    }
  }

  const automation = computeAutomationCounts(leads);

  return {
    todayNewDb,
    todayCounselingCompleted,
    contractInProgress,
    thisMonthContractCompleted,
    thisMonthExpectedFee,
    thisMonthRegisteredCount,
    thisMonthSalesRevenueWon,
    thisMonthConfirmedCommissionWon: thisMonthSalesRevenueWon,
    expectedCommissionTotal: thisMonthSalesRevenueWon,
    staff: Array.from(staff.values()).sort((a, b) => b.counselingCount - a.counselingCount),
    unprocessedNewDb: automation.unprocessedNewDb,
    followUpPlanned: leads.filter((l) => l.counselingStatus === "상담중" && !!l.nextContactAt).length,
    unresponsive: leads.filter((l) => l.counselingStatus === "부재").length,
    exportInProgress: leads.filter((l) => computeCategory([l], "export-progress").length === 1).length,
    automation,
    abandoned7days: automation.abandoned7days,
    staffPipeline: computeStaffPipelineBreakdown(leads),
    sourceFunnel: computeSourceFunnelMetrics(leads),
  };
}

export { calculateExpectedCommission, expectedFeeWonForLead, toSafeMoney } from "./leaseCrmCommissionMetrics";
