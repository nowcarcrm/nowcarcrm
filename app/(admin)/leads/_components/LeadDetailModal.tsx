"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { modalBackdropMotion, modalPanelMotion } from "@/app/_lib/crmMotion";
import { TapButton } from "@/app/_components/ui/crm-motion";
import {
  BASE_CONTRACT_TERM_OPTIONS,
  CONSULT_RESULT_OPTIONS,
  CREDIT_REVIEW_STATUS_OPTIONS,
  FAILURE_REASON_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  LEAD_PRIORITY_OPTIONS,
  defaultLeadOperationalFields,
  requiresFailureReasonStatus,
  type CounselingRecord,
  type CounselingStatus,
  type ContractInfo,
  type CreditReviewStatus,
  type CustomerType,
  type ExportProgress,
  type ExportStage,
  type Importance,
  type Lead,
  type LeadPriority,
  type LeadTemperature,
  type LeaseProduct,
  type ContactMethod,
  type QuoteDeliveryType,
  type QuoteHistoryEntry,
  type QuoteProductType,
  QUOTE_DELIVERY_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
} from "../../_lib/leaseCrmTypes";
import {
  applyContractSnapshotBeforeSave,
  calculateAmountFromPercent,
  calculatePercentFromAmount,
  clampPercent,
  contractPartialFromLatestQuote,
  formatDepositDbLine,
  formatWonInput,
  hasFinalDeliverySnapshot,
  hasFullContractAmountSnapshot,
  hasLockedMonetarySnapshot,
  normalizeQuoteMoneyForPersistence,
  parseDigitsToInt,
  parsePercentInput,
  safeNonNegativeInt,
  shouldPersistContractAmountSnapshot,
} from "../../_lib/leaseCrmContractPersist";
import { counselingStatusFromExportProgress } from "../../_lib/leaseCrmLogic";
import { applyStaffLeadClientLocks } from "../../_lib/leaseCrmStorage";
import { fetchLeadById, formatSupabaseError } from "../../_lib/leaseCrmSupabase";
import { EMPLOYEES } from "../../_lib/leaseCrmSeed";
import { listActiveUsers } from "../../_lib/usersSupabase";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import toast from "react-hot-toast";
import { devLog } from "@/app/_lib/devLog";
import AiCounselAssistPopup from "./AiCounselAssistPopup";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** 계약일·약정일·출고 예정일을 date input / DB에 맞는 yyyy-mm-dd로 통일 */
function normalizeContractDateField(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  if (!t) return "";
  const head = t.length >= 10 ? t.slice(0, 10) : t;
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "";
}

function coerceContractNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.replace(/,/g, "").trim() === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type QuoteFormDraft = {
  quotedAt: string;
  productType: QuoteProductType;
  financeCompany: string;
  vehicleModel: string;
  vehiclePrice: number;
  contractTerm: string;
  depositAmount: number;
  depositPercent: number;
  prepaymentAmount: number;
  prepaymentPercent: number;
  feeAmount: number;
  feePercent: number;
  monthlyPayment: number;
  deliveryType: QuoteDeliveryType;
  maintenanceIncluded: boolean;
  note: string;
};

function emptyQuoteForm(): QuoteFormDraft {
  return {
    quotedAt: todayYmdLocal(),
    productType: "렌트",
    financeCompany: "",
    vehicleModel: "",
    vehiclePrice: 0,
    contractTerm: "36개월",
    depositAmount: 0,
    depositPercent: 0,
    prepaymentAmount: 0,
    prepaymentPercent: 0,
    feeAmount: 0,
    feePercent: 0,
    monthlyPayment: 0,
    deliveryType: "agency",
    maintenanceIncluded: false,
    note: "",
  };
}

const FINANCE_COMPANY_SUGGESTIONS = [
  "현대캐피탈",
  "KB캐피탈",
  "메리츠캐피탈",
  "IM캐피탈",
  "롯데캐피탈",
  "BNK캐피탈",
  "우리금융캐피탈",
];

/** 기존 lead.contract와 병합 후 저장용으로 정규화 (문자열 숫자·날짜 보정) */
function sanitizeContractForSave(c: ContractInfo, fallbackContractTerm: string): ContractInfo {
  const vehiclePrice = safeNonNegativeInt(coerceContractNumber(c.vehiclePrice));
  const depositAmount = safeNonNegativeInt(coerceContractNumber(c.depositAmount));
  const depositPercent = clampPercent(coerceContractNumber(c.depositPercent));
  const fee = safeNonNegativeInt(coerceContractNumber(c.fee));
  const feePercent = clampPercent(coerceContractNumber(c.feePercent));
  const depLine = formatDepositDbLine(depositAmount, depositPercent);
  const depositOrPrepayment = depLine || String(c.depositOrPrepayment ?? "").trim();
  const deliveryType =
    c.deliveryType === "대리점 출고" || c.deliveryType === "특판 출고" ? c.deliveryType : "";
  return {
    ...c,
    contractDate: normalizeContractDateField(c.contractDate),
    customerCommitmentDate: normalizeContractDateField(c.customerCommitmentDate),
    pickupPlannedAt: normalizeContractDateField(c.pickupPlannedAt),
    monthlyPayment: safeNonNegativeInt(coerceContractNumber(c.monthlyPayment)),
    vehiclePrice,
    depositAmount,
    depositPercent,
    fee,
    feePercent,
    prepaymentSupportAmount: coerceContractNumber(c.prepaymentSupportAmount),
    suppliesSupportAmount: coerceContractNumber(c.suppliesSupportAmount),
    totalSupportCost: coerceContractNumber(c.totalSupportCost),
    contractTerm: (c.contractTerm ?? "").trim() || fallbackContractTerm,
    vehicleName: (c.vehicleName ?? "").trim(),
    depositOrPrepayment,
    suppliesSupportContent: (c.suppliesSupportContent ?? "").trim(),
    note: (c.note ?? "").trim(),
    profitMemo: (c.profitMemo ?? "").trim(),
    deliveryType,
    product:
      c.product === "운용리스" || c.product === "금융리스" || c.product === "장기렌트"
        ? c.product
        : "장기렌트",
    finalVehiclePrice:
      c.finalVehiclePrice == null
        ? c.finalVehiclePrice
        : safeNonNegativeInt(coerceContractNumber(c.finalVehiclePrice)),
    finalDepositAmount:
      c.finalDepositAmount == null
        ? c.finalDepositAmount
        : safeNonNegativeInt(coerceContractNumber(c.finalDepositAmount)),
    finalFeeAmount:
      c.finalFeeAmount == null
        ? c.finalFeeAmount
        : safeNonNegativeInt(coerceContractNumber(c.finalFeeAmount)),
    finalDeliveryType:
      c.finalDeliveryType === "대리점 출고" || c.finalDeliveryType === "특판 출고"
        ? c.finalDeliveryType
        : null,
  };
}

function fromDateInputValue(dateOnly: string) {
  // date-only(yyyy-mm-dd) -> ISO
  if (!dateOnly) return "";
  return new Date(`${dateOnly}T09:00:00`).toISOString();
}

/** 저장 직전: 배열·null 필드만 보정 (스프레드로 기존 lead 유지) */
function ensureLeadShape(lead: Lead): Lead {
  const depositAmt =
    typeof lead.base.depositOrPrepaymentAmount === "string"
      ? lead.base.depositOrPrepaymentAmount
      : "";
  const op = defaultLeadOperationalFields();
  return {
    ...lead,
    leadPriority: lead.leadPriority ?? op.leadPriority,
    failureReason: lead.failureReason ?? op.failureReason,
    failureReasonNote: lead.failureReasonNote ?? op.failureReasonNote,
    creditReviewStatus: lead.creditReviewStatus ?? op.creditReviewStatus,
    quoteHistory: Array.isArray(lead.quoteHistory) ? lead.quoteHistory : op.quoteHistory,
    base: {
      ...lead.base,
      wantedMonthlyPayment:
        typeof lead.base.wantedMonthlyPayment === "number" ? lead.base.wantedMonthlyPayment : 0,
      depositOrPrepaymentAmount: depositAmt,
      hasDepositOrPrepayment:
        lead.base.hasDepositOrPrepayment || depositAmt.trim().length > 0,
    },
    counselingRecords: Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [],
    contract: lead.contract ?? null,
    exportProgress: lead.exportProgress ?? null,
    deliveredAt: lead.deliveredAt ?? null,
    nextContactAt: lead.nextContactAt ?? null,
  };
}

function isValidIsoDateInput(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function fromDateTimeInputValue(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function statusPillClass(status: CounselingStatus) {
  switch (status) {
    case "신규":
      return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800/30 dark:text-zinc-200";
    case "상담중":
      return "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-100";
    case "부재":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-200";
    case "계약완료":
    case "확정":
    case "출고":
    case "인도완료":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "보류":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    case "취소":
      return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200";
    default:
      return "border-zinc-200 bg-white text-zinc-700";
  }
}

const EXPORT_TAB_INITIAL: ExportProgress = {
  stage: "계약완료",
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
};

function validateExportBeforeSave(local: ExportProgress): string | null {
  if (local.stage !== "인도 완료") return null;
  const hasDate =
    !!toDateInputValue(local.deliveredAt) || !!toDateInputValue(local.actualDeliveryDate);
  if (!hasDate) return "인도 완료일을 입력해주세요.";
  return null;
}

function exportStagePillClass(stage: ExportStage) {
  switch (stage) {
    case "인도 완료":
      return "border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-lime-200";
    case "전자약정 완료":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "전자약정 전":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800/30 dark:text-zinc-200";
  }
}

function tempPillClass(temp: LeadTemperature) {
  if (temp === "상") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (temp === "하") {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
}

function priorityPillClass(p: LeadPriority) {
  if (p === "긴급") {
    return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (p === "보류") {
    return "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200";
  }
  return "border-[var(--crm-blue)]/30 bg-[var(--crm-blue)]/10 text-[var(--crm-blue-deep)] dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-200";
}

export default function LeadDetailModal({
  lead,
  onClose,
  onUpdate,
  onDelete,
}: {
  lead: Lead;
  onClose: () => void;
  onUpdate: (
    next: Lead,
    options?: { syncConsultations?: boolean }
  ) => void | Promise<void>;
  onDelete: (id: string) => void;
}) {
  type TabKey = "basic" | "records" | "quotes" | "contract" | "export";
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [draft, setDraft] = useState<Lead>(lead);
  const [saving, setSaving] = useState(false);
  /** 상담기록 추가 시 함께 바꿀 상담결과 — 빈 문자열이면 유지 */
  const [recordCounselingStatusSideEffect, setRecordCounselingStatusSideEffect] = useState<
    "" | CounselingStatus
  >("");
  const prevLeadIdRef = useRef<string | null>(null);
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion === true;
  const backdropMotion = modalBackdropMotion(reduce);
  const panelMotion = modalPanelMotion(reduce);
  const staffContractLocked = profile?.role === "staff";
  /** 담당 직원 변경은 Admin만 (staff·manager는 UI·저장 모두 본인/고정). */
  const canReassignLeadOwner = profile?.role === "admin";
  /** 상담기록의「상담 담당자」는 admin만 변경 가능(staff·manager는 읽기 전용). */
  const canPickCounselor = profile?.role === "admin";

  const [leadOwnerOptions, setLeadOwnerOptions] = useState<Array<{ id: string; name: string }>>(
    () => []
  );

  const leadPayloadForServer = useCallback(
    (l: Lead): Lead => {
      const shaped = ensureLeadShape(l);
      if (!profile || profile.role !== "staff") return shaped;
      return applyStaffLeadClientLocks(shaped, { userId: profile.userId, name: profile.name });
    },
    [profile]
  );

  useEffect(() => {
    if (!canReassignLeadOwner) return;
    let cancelled = false;
    void listActiveUsers()
      .then((users) => {
        if (cancelled) return;
        const options = users
          .filter((u) => !!u.id && !!u.name?.trim())
          .map((u) => ({ id: u.id, name: u.name.trim() }));
        setLeadOwnerOptions(options);
      })
      .catch(() => {
        if (!cancelled) setLeadOwnerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canReassignLeadOwner]);

  const leadOwnerSelectChoices = useMemo(() => {
    const byId = new Map<string, string>(leadOwnerOptions.map((u) => [u.id, u.name]));
    if (draft.managerUserId && draft.base.ownerStaff?.trim() && !byId.has(draft.managerUserId)) {
      byId.set(draft.managerUserId, draft.base.ownerStaff.trim());
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [leadOwnerOptions, draft.managerUserId, draft.base.ownerStaff]);

  const [counselorOptions, setCounselorOptions] = useState<string[]>(() => [...EMPLOYEES]);

  useEffect(() => {
    if (!canPickCounselor) return;
    let cancelled = false;
    void listActiveUsers()
      .then((users) => {
        if (cancelled) return;
        const names = users.map((u) => u.name).filter(Boolean) as string[];
        setCounselorOptions(names.length > 0 ? names : [...EMPLOYEES]);
      })
      .catch(() => {
        if (!cancelled) setCounselorOptions([...EMPLOYEES]);
      });
    return () => {
      cancelled = true;
    };
  }, [canPickCounselor]);

  const base = draft.base;

  const [recordDraft, setRecordDraft] = useState<Omit<CounselingRecord, "id">>({
    occurredAt: new Date().toISOString(),
    counselor: lead.base.ownerStaff,
    method: "전화",
    content: "",
    reaction: "",
    desiredProgressAt: new Date().toISOString(),
    nextContactAt: new Date().toISOString(),
    nextContactMemo: "",
    importance: "보통",
  });

  const counselorSelectChoices = useMemo(() => {
    const baseOpts = counselorOptions.length > 0 ? counselorOptions : [...EMPLOYEES];
    const set = new Set<string>(baseOpts);
    const cur = recordDraft.counselor?.trim();
    if (cur) set.add(cur);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [counselorOptions, recordDraft.counselor]);

  useEffect(() => {
    setRecordCounselingStatusSideEffect("");
  }, [lead.id]);

  useEffect(() => {
    setRecordDraft((p) => {
      if (profile?.role === "staff") {
        const n = profile.name?.trim();
        if (n) return { ...p, counselor: n };
        return p;
      }
      return { ...p, counselor: base.ownerStaff };
    });
  }, [base.ownerStaff, profile?.role, profile?.name]);

  const [quoteDraft, setQuoteDraft] = useState<QuoteFormDraft>(() => emptyQuoteForm());

  useLayoutEffect(() => {
    console.log("LeadDetailModal incoming lead:", lead);
    setDraft({
      ...lead,
      counselingRecords: Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [],
    });
    const prev = prevLeadIdRef.current;
    if (prev !== null && prev !== lead.id) {
      setActiveTab("basic");
      setQuoteDraft(emptyQuoteForm());
      setRecordDraft({
        occurredAt: new Date().toISOString(),
        counselor:
          profile?.role === "staff"
            ? profile?.name?.trim() || lead.base.ownerStaff
            : lead.base.ownerStaff,
        method: "전화",
        content: "",
        reaction: "",
        desiredProgressAt: new Date().toISOString(),
        nextContactAt: new Date().toISOString(),
        nextContactMemo: "",
        importance: "보통",
      });
    }
    prevLeadIdRef.current = lead.id;
  }, [lead, profile?.role, profile?.name]);

  const sortedQuotes = useMemo(
    () => [...(draft.quoteHistory ?? [])].sort((a, b) => b.quotedAt.localeCompare(a.quotedAt)),
    [draft.quoteHistory]
  );

  const tabs = useMemo(
    () => [
      { key: "basic", label: "기본정보" },
      { key: "records", label: "상담기록" },
      { key: "quotes", label: "견적 이력" },
      { key: "contract", label: "계약 고객" },
      { key: "export", label: "출고 진행" },
    ],
    []
  );

  async function persist(next: Lead) {
    const payload = leadPayloadForServer(ensureLeadShape(next));
    devLog("[LeadDetailModal] persist 저장 직전 payload", payload);
    setSaving(true);
    try {
      await Promise.resolve(onUpdate(payload, { syncConsultations: false }));
      setDraft(payload);
      toast.success("저장했습니다.");
    } catch (error) {
      console.error("[LeadDetailModal] persist 저장 실패", formatSupabaseError(error), error, payload);
      toast.error("저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBase() {
    console.log("selectedUserId:", draft.managerUserId ?? null);
    if (canReassignLeadOwner && !draft.managerUserId) {
      toast.error("담당 직원을 선택해 주세요.");
      return;
    }
    if (requiresFailureReasonStatus(draft.counselingStatus)) {
      const fr = draft.failureReason?.trim() ?? "";
      if (!fr) {
        toast.error("실패 사유를 선택해 주세요.");
        return;
      }
      if (fr === "기타" && !(draft.failureReasonNote ?? "").trim()) {
        toast.error("기타 선택 시 상세 내용을 입력해 주세요.");
        return;
      }
    }
    if (profile?.role === "staff") {
      const uid = profile.userId;
      const myName = profile.name?.trim() ?? "";
      if (draft.managerUserId != null && draft.managerUserId !== uid) {
        toast.error("담당 직원은 본인만 지정할 수 있습니다.");
        return;
      }
      if (myName && draft.base.ownerStaff?.trim() !== myName) {
        toast.error("담당 직원은 본인만 지정할 수 있습니다.");
        return;
      }
    }
    const nextIso = new Date().toISOString();
    const statusChanged = draft.counselingStatus !== lead.counselingStatus;
    const next = leadPayloadForServer(
      ensureLeadShape({
        ...draft,
        updatedAt: nextIso,
        ...(statusChanged ? { statusUpdatedAt: nextIso, lastHandledAt: nextIso } : {}),
      })
    );
    devLog("[LeadDetailModal] 기본정보 저장 직전 payload", next);
    setSaving(true);
    try {
      await Promise.resolve(onUpdate(next, { syncConsultations: false }));
      setDraft(next);
      toast.success("저장했습니다.");
    } catch (error) {
      console.error("[LeadDetailModal] 기본정보 저장 실패", formatSupabaseError(error), error, next);
      toast.error("저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveContract(nextContract: ContractInfo | null, nextCounselingStatus?: CounselingStatus) {
    if (profile?.role === "staff") {
      toast.error("직원 권한에서는 계약을 저장할 수 없습니다.");
      return;
    }
    const nextIso = new Date().toISOString();
    const fallbackTerm = draft.base.contractTerm || "36개월";
    const today = new Date().toISOString().slice(0, 10);
    let contract: ContractInfo | null = null;
    if (nextContract) {
      const prev = draft.contract;
      const merged: ContractInfo = {
        ...(prev ?? {
          contractDate: today,
          customerCommitmentDate: today,
          product: "장기렌트",
          vehicleName: "",
          vehiclePrice: 0,
          monthlyPayment: 0,
          contractTerm: fallbackTerm,
          depositAmount: 0,
          depositPercent: 0,
          depositOrPrepayment: "",
          prepaymentSupportAmount: 0,
          suppliesSupportContent: "",
          suppliesSupportAmount: 0,
          totalSupportCost: 0,
          note: "",
          fee: 0,
          feePercent: 0,
          profitMemo: "",
          pickupPlannedAt: today,
          deliveryType: "",
        }),
        ...nextContract,
      };
      const rawVp = coerceContractNumber(merged.vehiclePrice);
      const depPct = coerceContractNumber(merged.depositPercent);
      const feePct = coerceContractNumber(merged.feePercent);
      if (rawVp <= 0 && (depPct > 0 || feePct > 0)) {
        toast.error("차량가를 입력한 뒤 퍼센트를 사용할 수 있습니다.");
        return;
      }
      contract = applyContractSnapshotBeforeSave(
        sanitizeContractForSave(merged, fallbackTerm),
        nextCounselingStatus ?? draft.counselingStatus
      );
      if (
        !Number.isFinite(contract.vehiclePrice) ||
        !Number.isFinite(contract.depositAmount) ||
        !Number.isFinite(contract.depositPercent) ||
        !Number.isFinite(contract.fee) ||
        !Number.isFinite(contract.feePercent)
      ) {
        toast.error("금액·비율을 확인해 주세요.");
        return;
      }
    }
    const counselingForSnap = nextCounselingStatus ?? draft.counselingStatus;
    const priorContract = draft.contract;
    const priorMonetary = priorContract ? hasLockedMonetarySnapshot(priorContract) : false;
    const priorDelivery = priorContract ? hasFinalDeliverySnapshot(priorContract) : false;
    const afterMonetary = contract ? hasLockedMonetarySnapshot(contract) : false;
    const afterDelivery = contract ? hasFinalDeliverySnapshot(contract) : false;

    const payload = ensureLeadShape({
      ...draft,
      contract,
      ...(nextCounselingStatus !== undefined ? { counselingStatus: nextCounselingStatus } : {}),
      updatedAt: nextIso,
      lastHandledAt: nextIso,
    });
    console.log("contract payload:", payload);
    console.log("[contract payload fields]", {
      commission: payload.contract?.fee ?? null,
      commission_rate: payload.contract?.feePercent ?? null,
      fee: payload.contract?.fee ?? null,
      contract_date: payload.contract?.contractDate ?? null,
      delivered_at: payload.deliveredAt ?? payload.exportProgress?.deliveredAt ?? null,
      category: null,
      customer_stage: payload.counselingStatus,
      consultation_result: payload.counselingStatus,
    });
    devLog("[계약 저장] 최종 Lead payload (모달 → onUpdate / handleUpdateLead)", payload);
    devLog("[계약 저장] 계약 탭 contract 필드만", payload.contract);
    devLog(
      "[계약 저장] 현재 운영 모드는 leads 단일 테이블 업데이트만 수행합니다. relation 테이블 저장은 비활성화되어 있습니다."
    );
    setSaving(true);
    try {
      const toSave = leadPayloadForServer(payload);
      await Promise.resolve(onUpdate(toSave, { syncConsultations: false }));
      devLog("[계약 저장] onUpdate 완료(서버 성공)", {
        leadId: toSave.id,
        contract: toSave.contract,
      });
      let extra = false;
      if (contract && shouldPersistContractAmountSnapshot(counselingForSnap)) {
        if (!priorMonetary && afterMonetary) {
          toast.success("최종 계약 금액이 확정되었습니다.");
          extra = true;
        } else if (priorMonetary && !priorDelivery && afterDelivery) {
          toast.success("확정 스냅샷에 출고 유형이 반영되었습니다.");
          extra = true;
        }
      }
      if (!extra) toast.success("계약 고객 정보가 저장되었습니다.");
      setDraft(toSave);
      if (profile) {
        try {
          const fresh = await fetchLeadById(toSave.id, { role: profile.role, userId: profile.userId });
          if (fresh) setDraft(ensureLeadShape(fresh));
        } catch (reloadErr) {
          console.warn("[LeadDetailModal] 계약 저장 후 재조회 실패", reloadErr);
        }
      }
    } catch (error) {
      console.error("계약 저장 오류", error, payload);
      toast.error("계약 고객 정보 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveExport(nextExport: ExportProgress | null, nextCounselingStatus?: CounselingStatus) {
    const nextIso = new Date().toISOString();
    const payload = ensureLeadShape({
      ...draft,
      exportProgress: nextExport,
      counselingStatus: nextCounselingStatus ?? draft.counselingStatus,
      updatedAt: nextIso,
      lastHandledAt: nextIso,
      deliveredAt:
        nextExport == null
          ? null
          : nextExport.stage === "인도 완료"
            ? nextExport.deliveredAt ?? nextExport.actualDeliveryDate ?? null
            : draft.deliveredAt,
    });
    devLog("[LeadDetailModal] 출고 저장 직전 payload", payload);
    setSaving(true);
    try {
      const toSave = leadPayloadForServer(payload);
      await Promise.resolve(onUpdate(toSave, { syncConsultations: false }));
      setDraft(toSave);
      toast.success("저장했습니다.");
    } catch (error) {
      console.error("출고 저장 오류", error, payload);
      toast.error("저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const importanceOptions: Importance[] = ["높음", "보통", "낮음"];

  const status = draft.counselingStatus;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        initial={backdropMotion.initial}
        animate={backdropMotion.animate}
        transition={backdropMotion.transition}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          className="crm-modal-panel pointer-events-auto max-h-[min(90dvh,920px)] max-w-5xl overflow-y-auto overscroll-y-contain"
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          transition={panelMotion.transition}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {base.name} ({base.ownerStaff})
                </div>
                <span
                  title={`상담결과: ${status}`}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    statusPillClass(status)
                  )}
                >
                  {status}
                </span>
              </div>
              <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                연락처 {base.phone} · 유입 {base.source}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    tempPillClass(base.leadTemperature)
                  )}
                >
                  고객 온도: {base.leadTemperature}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    priorityPillClass(draft.leadPriority)
                  )}
                >
                  우선순위: {draft.leadPriority}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {status !== "취소" ? (
                <TapButton
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(`${base.name} 고객을 삭제할까요?`);
                    if (!ok) return;
                    onDelete(draft.id);
                  }}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:bg-rose-950/35"
                >
                  삭제
                </TapButton>
              ) : (
                <span />
              )}
              <TapButton
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                aria-label="모달 닫기"
              >
                ✕
              </TapButton>
            </div>
          </div>

          <div className="mt-5 border-b border-zinc-200 dark:border-zinc-800">
            <LayoutGroup id="lead-detail-modal-tabs">
              <div className="-mb-px flex flex-wrap gap-0.5">
                {tabs.map((t) => {
                  const on = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key as TabKey)}
                      className={cn(
                        "relative rounded-t-lg px-3 py-2.5 text-sm transition-colors",
                        on
                          ? "font-semibold text-zinc-900 dark:text-zinc-50"
                          : "font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      )}
                    >
                      {on ? (
                        <motion.span
                          layoutId="lead-modal-tab-underline"
                          className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-[var(--crm-blue-deep)] dark:bg-sky-400"
                          transition={{ type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        />
                      ) : null}
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6"
            >
            {activeTab === "basic" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="고객명">
                    <input
                      value={draft.base.name}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: { ...p.base, name: e.target.value },
                        }))
                      }
                      className="crm-field"
                      placeholder="예: 김민지"
                    />
                  </Field>
                  <Field label="연락처">
                    <input
                      value={draft.base.phone}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: { ...p.base, phone: e.target.value },
                        }))
                      }
                      className="crm-field"
                      placeholder="예: 010-1234-5678"
                    />
                  </Field>

                  <Field label="원하는 차종">
                    <input
                      value={draft.base.desiredVehicle}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: { ...p.base, desiredVehicle: e.target.value },
                        }))
                      }
                      className="crm-field"
                      placeholder="예: 쏘나타 / 그랜저 등"
                    />
                  </Field>
                  <Field label="유입 경로">
                    <select
                      value={
                        (LEAD_SOURCE_OPTIONS as readonly string[]).includes(draft.base.source)
                          ? draft.base.source
                          : draft.base.source
                            ? `__legacy__:${draft.base.source}`
                            : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((p) => ({
                          ...p,
                          base: {
                            ...p.base,
                            source: v.startsWith("__legacy__:") ? v.slice(11) : v,
                          },
                        }));
                      }}
                      className="crm-field crm-field-select"
                    >
                      <option value="">선택</option>
                      {(LEAD_SOURCE_OPTIONS as readonly string[]).includes(draft.base.source) ? null : draft.base.source ? (
                        <option value={`__legacy__:${draft.base.source}`}>
                          {draft.base.source} (현재 저장값)
                        </option>
                      ) : null}
                      {LEAD_SOURCE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="고객 유형">
                    <select
                      value={draft.base.customerType}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: {
                            ...p.base,
                            customerType: e.target.value as CustomerType,
                          },
                        }))
                      }
                      className="crm-field crm-field-select"
                    >
                      {(["개인", "개인사업자", "법인"] as CustomerType[]).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="고객 온도">
                    <select
                      value={draft.base.leadTemperature}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: {
                            ...p.base,
                            leadTemperature: e.target.value as LeadTemperature,
                          },
                        }))
                      }
                      className={cn(
                        "crm-field crm-field-select",
                        tempPillClass(draft.base.leadTemperature)
                      )}
                    >
                      {(["상", "중", "하"] as LeadTemperature[]).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="우선순위">
                    <select
                      value={draft.leadPriority}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          leadPriority: e.target.value as LeadPriority,
                        }))
                      }
                      className={cn(
                        "crm-field crm-field-select",
                        priorityPillClass(draft.leadPriority)
                      )}
                    >
                      {LEAD_PRIORITY_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="심사 상태">
                    <select
                      value={draft.creditReviewStatus}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          creditReviewStatus: e.target.value as CreditReviewStatus,
                        }))
                      }
                      className="crm-field crm-field-select"
                    >
                      {CREDIT_REVIEW_STATUS_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="계약기간">
                    <select
                      value={
                        (BASE_CONTRACT_TERM_OPTIONS as readonly string[]).includes(
                          draft.base.contractTerm
                        )
                          ? draft.base.contractTerm
                          : draft.base.contractTerm
                      }
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          base: { ...p.base, contractTerm: e.target.value },
                        }))
                      }
                      className="crm-field crm-field-select"
                    >
                      {(BASE_CONTRACT_TERM_OPTIONS as readonly string[]).includes(
                        draft.base.contractTerm
                      ) ? null : (
                        <option value={draft.base.contractTerm}>
                          {draft.base.contractTerm} (현재 저장값)
                        </option>
                      )}
                      {BASE_CONTRACT_TERM_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="보증금/선납금(금액)">
                    <input
                      value={draft.base.depositOrPrepaymentAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((p) => ({
                          ...p,
                          base: {
                            ...p.base,
                            depositOrPrepaymentAmount: v,
                            hasDepositOrPrepayment: v.trim().length > 0,
                          },
                        }));
                      }}
                      className="crm-field"
                      placeholder="예: 100만원, 0원"
                    />
                  </Field>

                  <Field label="담당 직원">
                    {canReassignLeadOwner ? (
                      <select
                        value={draft.managerUserId ?? ""}
                        onChange={(e) => {
                          const selectedUserId = e.target.value;
                          const selected = leadOwnerSelectChoices.find((u) => u.id === selectedUserId);
                          console.log("selectedUserId:", selectedUserId || null);
                          setDraft((p) => ({
                            ...p,
                            managerUserId: selectedUserId || null,
                            base: { ...p.base, ownerStaff: selected?.name ?? p.base.ownerStaff },
                          }));
                        }}
                        className="crm-field crm-field-select"
                      >
                        <option value="" disabled>
                          담당 직원을 선택하세요
                        </option>
                        {leadOwnerSelectChoices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={draft.base.ownerStaff}
                        className="crm-field cursor-not-allowed opacity-90 dark:opacity-95"
                        title={
                          profile?.role === "staff"
                            ? "직원(staff)은 담당 직원을 본인으로만 유지할 수 있습니다."
                            : "담당 직원 변경은 관리자(Admin)만 할 수 있습니다."
                        }
                      />
                    )}
                  </Field>

                  <div className="sm:col-span-2 rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">상담결과</span>는 DB·목록과
                      공유됩니다. 다음 연락 예정일·메모는{" "}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">상담기록</span> 탭에서만
                      입력합니다.
                    </p>
                  </div>

                  <Field label="상담결과">
                    <select
                      value={draft.counselingStatus}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          counselingStatus: e.target.value as CounselingStatus,
                        }))
                      }
                      className={cn(
                        "crm-field crm-field-select",
                        statusPillClass(draft.counselingStatus)
                      )}
                    >
                      {CONSULT_RESULT_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s === "인도완료" ? "인도 완료" : s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {requiresFailureReasonStatus(draft.counselingStatus) ? (
                    <>
                      <Field label="실패 사유 (필수)">
                        <select
                          value={
                            (FAILURE_REASON_OPTIONS as readonly string[]).includes(draft.failureReason)
                              ? draft.failureReason
                              : draft.failureReason
                                ? `__legacy__:${draft.failureReason}`
                                : ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              failureReason: v.startsWith("__legacy__:") ? v.slice(11) : v,
                            }));
                          }}
                          className="crm-field crm-field-select"
                        >
                          <option value="">선택</option>
                          {(FAILURE_REASON_OPTIONS as readonly string[]).includes(draft.failureReason)
                            ? null
                            : draft.failureReason ? (
                                <option value={`__legacy__:${draft.failureReason}`}>
                                  {draft.failureReason} (저장값)
                                </option>
                              ) : null}
                          {FAILURE_REASON_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="실패 사유 상세 (기타 시 필수)">
                          <textarea
                            value={draft.failureReasonNote}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, failureReasonNote: e.target.value }))
                            }
                            rows={2}
                            className="crm-field resize-none"
                            placeholder="기타 선택 시 구체적 사유"
                          />
                        </Field>
                      </div>
                    </>
                  ) : null}

                  <div className="sm:col-span-2">
                    <Field label="메모">
                      <textarea
                        value={draft.base.memo}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            base: { ...p.base, memo: e.target.value },
                          }))
                        }
                        rows={4}
                        className="crm-field resize-none"
                        placeholder="예: 고객 요구사항/메모"
                      />
                    </Field>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <TapButton
                    type="button"
                    onClick={() => void saveBase()}
                    className="crm-btn-primary disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving ? "저장 중…" : "기본정보 저장"}
                  </TapButton>
                </div>
              </div>
            ) : null}

            {activeTab === "records" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    상담기록
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    다음 연락 예정일·메모는 각 상담기록에 입력하며, 저장 시 고객의「다음 연락」스냅샷으로
                    반영됩니다.
                  </div>
                </div>

                <ul className="space-y-3">
                  {(draft.counselingRecords ?? []).length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                      아직 상담기록이 없습니다.
                    </li>
                  ) : (
                    (draft.counselingRecords ?? [])
                      .slice()
                      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
                      .map((r) => (
                        <li key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {r.method} · 작성자 {r.counselor}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {r.occurredAt.slice(0, 10)} {r.occurredAt.slice(11, 16)}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                                r.importance === "높음"
                                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                                  : r.importance === "낮음"
                                    ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200"
                                    : "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800/30 dark:text-zinc-200"
                              )}
                            >
                              중요도: {r.importance}
                            </span>
                          </div>

                          <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
                            {r.content}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-300">
                              고객 반응: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{r.reaction}</span>
                            </div>
                            <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-300">
                              다음 연락 예정일:{" "}
                              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{r.nextContactAt.slice(0, 10)}</span>
                            </div>
                            <div className="sm:col-span-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-300">
                              메모: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{r.nextContactMemo || "-"}</span>
                            </div>
                          </div>
                        </li>
                      ))
                  )}
                </ul>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    기록 추가
                  </div>
                  <form
                    className="mt-4 grid gap-4 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!recordDraft.content.trim()) {
                        toast.error("상담 내용을 입력해 주세요.");
                        return;
                      }
                      if (!isValidIsoDateInput(recordDraft.occurredAt)) {
                        toast.error("상담일시를 확인해 주세요.");
                        return;
                      }
                      if (
                        recordCounselingStatusSideEffect !== "" &&
                        requiresFailureReasonStatus(recordCounselingStatusSideEffect) &&
                        !(draft.failureReason ?? "").trim()
                      ) {
                        toast.error("보류/취소로 바꿀 때는 기본정보에서 실패 사유를 먼저 선택해 주세요.");
                        return;
                      }
                      const nextIso = new Date().toISOString();
                      const oc = new Date(recordDraft.occurredAt).toISOString();
                      const desired = oc;
                      const nextContactRec =
                        isValidIsoDateInput(recordDraft.nextContactAt)
                          ? new Date(recordDraft.nextContactAt).toISOString()
                          : oc;
                      const counselorForSave =
                        profile?.role === "staff"
                          ? (profile.name?.trim() || recordDraft.counselor)
                          : recordDraft.counselor;
                      const rec: CounselingRecord = {
                        id:
                          typeof crypto !== "undefined" && "randomUUID" in crypto
                            ? crypto.randomUUID()
                            : `rec_${Math.random().toString(16).slice(2)}`,
                        ...recordDraft,
                        counselor: counselorForSave,
                        occurredAt: oc,
                        desiredProgressAt: desired,
                        nextContactAt: nextContactRec,
                      };
                      const priorRecords = Array.isArray(draft.counselingRecords)
                        ? draft.counselingRecords
                        : [];
                      const statusSide =
                        recordCounselingStatusSideEffect !== ""
                          ? {
                              counselingStatus: recordCounselingStatusSideEffect,
                              statusUpdatedAt: nextIso,
                              lastHandledAt: nextIso,
                            }
                          : {};
                      const nextLead = ensureLeadShape({
                        ...draft,
                        counselingRecords: [rec, ...priorRecords],
                        updatedAt: nextIso,
                        statusUpdatedAt: statusSide.statusUpdatedAt ?? draft.statusUpdatedAt,
                        lastHandledAt: statusSide.lastHandledAt ?? nextIso,
                        ...statusSide,
                      });
                      devLog("[LeadDetailModal] 상담기록 추가 직전 payload", nextLead);
                      void (async () => {
                        try {
                          const toSave = leadPayloadForServer(nextLead);
                          await Promise.resolve(onUpdate(toSave, { syncConsultations: true }));
                          setDraft(toSave);
                          setRecordCounselingStatusSideEffect("");
                        } catch (err) {
                          console.error(
                            "[LeadDetailModal] 상담기록 추가 저장 실패",
                            formatSupabaseError(err),
                            err,
                            nextLead
                          );
                          toast.error("저장하지 못했습니다.");
                        }
                      })();
                    }}
                  >
                    <Field label="상담일시">
                      <input
                        type="datetime-local"
                        value={(() => {
                          const iso = recordDraft.occurredAt;
                          const d = new Date(iso);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          const yyyy = d.getFullYear();
                          const mm = pad(d.getMonth() + 1);
                          const dd = pad(d.getDate());
                          const hh = pad(d.getHours());
                          const mi = pad(d.getMinutes());
                          return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
                        })()}
                        onChange={(e) =>
                          setRecordDraft((p) => ({ ...p, occurredAt: fromDateTimeInputValue(e.target.value) }))
                        }
                        className="crm-field"
                      />
                    </Field>

                    <Field label="상담 담당자">
                      {canPickCounselor ? (
                        <select
                          value={recordDraft.counselor}
                          onChange={(e) => setRecordDraft((p) => ({ ...p, counselor: e.target.value }))}
                          className="crm-field crm-field-select"
                        >
                          {counselorSelectChoices.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="space-y-1">
                          <input
                            readOnly
                            value={recordDraft.counselor}
                            className="crm-field cursor-not-allowed bg-zinc-50 text-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200"
                            aria-readonly="true"
                          />
                          {profile?.role === "staff" ? (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              직원 계정은 상담 담당자가 본인으로만 저장됩니다.
                            </p>
                          ) : null}
                          {profile?.role === "manager" ? (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              상담 담당자 변경은 관리자만 할 수 있습니다.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </Field>

                    <Field label="상담 방식">
                      <select
                        value={recordDraft.method}
                        onChange={(e) => setRecordDraft((p) => ({ ...p, method: e.target.value as ContactMethod }))}
                        className="crm-field crm-field-select"
                      >
                        {(["전화", "문자", "카톡", "방문"] as ContactMethod[]).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="중요도">
                      <select
                        value={recordDraft.importance}
                        onChange={(e) => setRecordDraft((p) => ({ ...p, importance: e.target.value as Importance }))}
                        className="crm-field crm-field-select"
                      >
                        {importanceOptions.map((i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="저장 시 상담결과">
                      <select
                        value={recordCounselingStatusSideEffect}
                        onChange={(e) =>
                          setRecordCounselingStatusSideEffect((e.target.value || "") as "" | CounselingStatus)
                        }
                        className="crm-field crm-field-select"
                      >
                        <option value="">변경 없음</option>
                        {CONSULT_RESULT_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s === "인도완료" ? "인도 완료" : s}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        선택 시 고객 상태가 함께 바뀌며, 저장 후 왼쪽 단계(예: 인도 완료)로 이동합니다.
                      </p>
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="상담 내용">
                        <textarea
                          value={recordDraft.content}
                          onChange={(e) => setRecordDraft((p) => ({ ...p, content: e.target.value }))}
                          rows={4}
                          className="crm-field resize-none"
                          placeholder="상담 내용을 적어주세요."
                        />
                      </Field>
                    </div>

                    <Field label="고객 반응">
                      <input
                        value={recordDraft.reaction}
                        onChange={(e) => setRecordDraft((p) => ({ ...p, reaction: e.target.value }))}
                        className="crm-field"
                        placeholder="예: 긍정/보통/부정 등"
                      />
                    </Field>

                    <Field label="다음 연락 예정일">
                      <input
                        type="date"
                        value={toDateInputValue(recordDraft.nextContactAt)}
                        onChange={(e) =>
                          setRecordDraft((p) => ({ ...p, nextContactAt: fromDateInputValue(e.target.value) }))
                        }
                        className="crm-field"
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="다음 연락 메모">
                        <textarea
                          value={recordDraft.nextContactMemo}
                          onChange={(e) => setRecordDraft((p) => ({ ...p, nextContactMemo: e.target.value }))}
                          rows={3}
                          className="crm-field resize-none"
                          placeholder="다음 연락에서 확인할 내용"
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecordCounselingStatusSideEffect("");
                          setRecordDraft({
                            occurredAt: new Date().toISOString(),
                            counselor:
                              profile?.role === "staff"
                                ? profile?.name?.trim() || base.ownerStaff
                                : base.ownerStaff,
                            method: "전화",
                            content: "",
                            reaction: "",
                            desiredProgressAt: new Date().toISOString(),
                            nextContactAt: new Date().toISOString(),
                            nextContactMemo: "",
                            importance: "보통",
                          });
                        }}
                        className="crm-btn-secondary"
                      >
                        초기화
                      </button>
                      <button
                        type="submit"
                        className="crm-btn-primary disabled:opacity-50"
                        disabled={saving}
                      >
                        {saving ? "저장 중…" : "기록 추가"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {activeTab === "quotes" ? (
              <div className="space-y-6">
                <p className="rounded-md border border-[var(--crm-border)] bg-[var(--crm-canvas)] px-3 py-2.5 text-xs leading-relaxed text-[var(--crm-accent-muted)] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                  견적은 시간순으로 표시되며, <span className="font-semibold text-[var(--crm-blue)]">최신 견적</span>
                  을 강조합니다. 계약 탭의 월 납입금과는 별도로 보관됩니다.
                </p>
                <ul className="space-y-3">
                  {sortedQuotes.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      등록된 견적이 없습니다.
                    </li>
                  ) : (
                    sortedQuotes.map((q, idx) => (
                      <li
                        key={q.id}
                        className={cn(
                          "rounded-xl border p-4 dark:border-zinc-800",
                          idx === 0
                            ? "border-[var(--crm-blue)]/50 bg-[var(--crm-blue)]/[0.06] ring-1 ring-[var(--crm-blue)]/15 dark:bg-sky-500/10"
                            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {q.quotedAt} · {q.productType} · {q.vehicleModel || "(차종 미입력)"}
                            {idx === 0 ? (
                              <span className="ml-2 rounded-md bg-[var(--crm-blue-deep)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                최신
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs font-medium text-zinc-500">
                            {q.contractTerm} · 월 {formatWonInput(q.monthlyPayment)}원
                          </div>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
                          <div>금융사: {q.financeCompany?.trim() || "—"}</div>
                          <div>
                            출고:{" "}
                            {QUOTE_DELIVERY_OPTIONS.find((o) => o.value === q.deliveryType)?.label ?? "—"}
                          </div>
                          <div>차량가: {q.vehiclePrice > 0 ? `${formatWonInput(q.vehiclePrice)}원` : "—"}</div>
                          <div>
                            보증금:{" "}
                            {q.depositAmount > 0
                              ? `${formatWonInput(q.depositAmount)}원${q.depositPercent > 0 ? ` (${q.depositPercent}%)` : ""}`
                              : "—"}
                          </div>
                          <div>
                            선납금:{" "}
                            {q.prepaymentAmount > 0
                              ? `${formatWonInput(q.prepaymentAmount)}원${q.prepaymentPercent > 0 ? ` (${q.prepaymentPercent}%)` : ""}`
                              : "—"}
                          </div>
                          <div>
                            수수료:{" "}
                            {q.feeAmount > 0
                              ? `${formatWonInput(q.feeAmount)}원${q.feePercent > 0 ? ` (${q.feePercent}%)` : ""}`
                              : "—"}
                          </div>
                          <div>정비 포함: {q.maintenanceIncluded ? "예" : "아니오"}</div>
                        </div>
                        {q.note ? (
                          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">비고: {q.note}</div>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">견적 추가</div>
                  <form
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!quoteDraft.quotedAt.trim()) {
                        toast.error("견적일을 입력해 주세요.");
                        return;
                      }
                      if (!quoteDraft.vehicleModel.trim()) {
                        toast.error("차종을 입력해 주세요.");
                        return;
                      }
                      const vp = safeNonNegativeInt(quoteDraft.vehiclePrice);
                      const dPct = clampPercent(quoteDraft.depositPercent);
                      const pPct = clampPercent(quoteDraft.prepaymentPercent);
                      const fPct = clampPercent(quoteDraft.feePercent);
                      if (vp <= 0 && (dPct > 0 || pPct > 0 || fPct > 0)) {
                        toast.error("차량가를 입력한 뒤 퍼센트를 사용할 수 있습니다.");
                        return;
                      }
                      const money = normalizeQuoteMoneyForPersistence(vp, {
                        depositAmount: quoteDraft.depositAmount,
                        depositPercent: quoteDraft.depositPercent,
                        prepaymentAmount: quoteDraft.prepaymentAmount,
                        prepaymentPercent: quoteDraft.prepaymentPercent,
                        feeAmount: quoteDraft.feeAmount,
                        feePercent: quoteDraft.feePercent,
                      });
                      const monthly = safeNonNegativeInt(quoteDraft.monthlyPayment);
                      const entry: QuoteHistoryEntry = {
                        id:
                          typeof crypto !== "undefined" && "randomUUID" in crypto
                            ? crypto.randomUUID()
                            : `q_${Math.random().toString(16).slice(2)}`,
                        quotedAt: quoteDraft.quotedAt.slice(0, 10),
                        productType: quoteDraft.productType,
                        financeCompany: quoteDraft.financeCompany.trim(),
                        vehicleModel: quoteDraft.vehicleModel.trim(),
                        vehiclePrice: vp,
                        contractTerm: quoteDraft.contractTerm,
                        depositAmount: money.depositAmount,
                        depositPercent: money.depositPercent,
                        prepaymentAmount: money.prepaymentAmount,
                        prepaymentPercent: money.prepaymentPercent,
                        feeAmount: money.feeAmount,
                        feePercent: money.feePercent,
                        monthlyPayment: monthly,
                        deliveryType: quoteDraft.deliveryType,
                        maintenanceIncluded: quoteDraft.maintenanceIncluded,
                        note: quoteDraft.note.trim(),
                      };
                      const next = ensureLeadShape({
                        ...draft,
                        quoteHistory: [entry, ...(draft.quoteHistory ?? [])],
                        updatedAt: new Date().toISOString(),
                        lastHandledAt: new Date().toISOString(),
                      });
                      void persist(next);
                      setQuoteDraft(emptyQuoteForm());
                    }}
                  >
                    <Field label="견적일">
                      <input
                        type="date"
                        value={quoteDraft.quotedAt}
                        onChange={(e) => setQuoteDraft((p) => ({ ...p, quotedAt: e.target.value }))}
                        className="crm-field"
                      />
                    </Field>
                    <Field label="상품유형">
                      <select
                        value={quoteDraft.productType}
                        onChange={(e) =>
                          setQuoteDraft((p) => ({
                            ...p,
                            productType: e.target.value as QuoteProductType,
                          }))
                        }
                        className="crm-field crm-field-select"
                      >
                        <option value="렌트">렌트</option>
                        <option value="리스">리스</option>
                      </select>
                    </Field>
                    <Field label="금융사">
                      <input
                        value={quoteDraft.financeCompany}
                        onChange={(e) => setQuoteDraft((p) => ({ ...p, financeCompany: e.target.value }))}
                        className="crm-field"
                        placeholder="금융사명"
                        list="quote-finance-suggestions"
                      />
                      <datalist id="quote-finance-suggestions">
                        {FINANCE_COMPANY_SUGGESTIONS.map((n) => (
                          <option key={n} value={n} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="차종">
                      <input
                        value={quoteDraft.vehicleModel}
                        onChange={(e) => setQuoteDraft((p) => ({ ...p, vehicleModel: e.target.value }))}
                        className="crm-field"
                        placeholder="차종"
                      />
                    </Field>
                    <Field label="차량가 (원)">
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        value={quoteDraft.vehiclePrice ? formatWonInput(quoteDraft.vehiclePrice) : ""}
                        onChange={(e) => {
                          const vp = parseDigitsToInt(e.target.value);
                          setQuoteDraft((p) => {
                            const next: QuoteFormDraft = { ...p, vehiclePrice: vp };
                            if (vp <= 0) return next;
                            if (p.depositPercent > 0) {
                              next.depositAmount = calculateAmountFromPercent(p.depositPercent, vp);
                            } else if (p.depositAmount > 0) {
                              next.depositPercent = calculatePercentFromAmount(p.depositAmount, vp);
                            }
                            if (p.prepaymentPercent > 0) {
                              next.prepaymentAmount = calculateAmountFromPercent(p.prepaymentPercent, vp);
                            } else if (p.prepaymentAmount > 0) {
                              next.prepaymentPercent = calculatePercentFromAmount(p.prepaymentAmount, vp);
                            }
                            if (p.feePercent > 0) {
                              next.feeAmount = calculateAmountFromPercent(p.feePercent, vp);
                            } else if (p.feeAmount > 0) {
                              next.feePercent = calculatePercentFromAmount(p.feeAmount, vp);
                            }
                            return next;
                          });
                        }}
                        className="crm-field text-right tabular-nums"
                        placeholder="0"
                      />
                    </Field>
                    <Field label="계약기간">
                      <select
                        value={quoteDraft.contractTerm}
                        onChange={(e) => setQuoteDraft((p) => ({ ...p, contractTerm: e.target.value }))}
                        className="crm-field crm-field-select"
                      >
                        {BASE_CONTRACT_TERM_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="출고 유형">
                      <select
                        value={quoteDraft.deliveryType}
                        onChange={(e) =>
                          setQuoteDraft((p) => ({
                            ...p,
                            deliveryType: e.target.value as QuoteDeliveryType,
                          }))
                        }
                        className="crm-field crm-field-select"
                      >
                        {QUOTE_DELIVERY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="보증금 (금액 / %)">
                        <div className="flex flex-wrap gap-2">
                          <input
                            inputMode="numeric"
                            className="crm-field min-w-[140px] flex-1 text-right tabular-nums"
                            placeholder="금액"
                            value={quoteDraft.depositAmount ? formatWonInput(quoteDraft.depositAmount) : ""}
                            onChange={(e) => {
                              const amt = parseDigitsToInt(e.target.value);
                              setQuoteDraft((p) => ({
                                ...p,
                                depositAmount: amt,
                                depositPercent:
                                  p.vehiclePrice > 0
                                    ? calculatePercentFromAmount(amt, p.vehiclePrice)
                                    : 0,
                              }));
                            }}
                          />
                          <div className="flex min-w-[100px] max-w-[120px] flex-1 items-center gap-1">
                            <input
                              inputMode="decimal"
                              className="crm-field min-w-0 flex-1 text-right tabular-nums"
                              disabled={quoteDraft.vehiclePrice <= 0}
                              placeholder="%"
                              value={quoteDraft.depositPercent === 0 ? "" : quoteDraft.depositPercent}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === "") {
                                  setQuoteDraft((p) => ({ ...p, depositPercent: 0 }));
                                  return;
                                }
                                const pct = parsePercentInput(raw);
                                setQuoteDraft((p) => ({
                                  ...p,
                                  depositPercent: pct,
                                  depositAmount:
                                    p.vehiclePrice > 0
                                      ? calculateAmountFromPercent(pct, p.vehiclePrice)
                                      : p.depositAmount,
                                }));
                              }}
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="선납금 (금액 / %)">
                        <div className="flex flex-wrap gap-2">
                          <input
                            inputMode="numeric"
                            className="crm-field min-w-[140px] flex-1 text-right tabular-nums"
                            placeholder="금액"
                            value={
                              quoteDraft.prepaymentAmount ? formatWonInput(quoteDraft.prepaymentAmount) : ""
                            }
                            onChange={(e) => {
                              const amt = parseDigitsToInt(e.target.value);
                              setQuoteDraft((p) => ({
                                ...p,
                                prepaymentAmount: amt,
                                prepaymentPercent:
                                  p.vehiclePrice > 0
                                    ? calculatePercentFromAmount(amt, p.vehiclePrice)
                                    : 0,
                              }));
                            }}
                          />
                          <div className="flex min-w-[100px] max-w-[120px] flex-1 items-center gap-1">
                            <input
                              inputMode="decimal"
                              className="crm-field min-w-0 flex-1 text-right tabular-nums"
                              disabled={quoteDraft.vehiclePrice <= 0}
                              placeholder="%"
                              value={quoteDraft.prepaymentPercent === 0 ? "" : quoteDraft.prepaymentPercent}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === "") {
                                  setQuoteDraft((p) => ({ ...p, prepaymentPercent: 0 }));
                                  return;
                                }
                                const pct = parsePercentInput(raw);
                                setQuoteDraft((p) => ({
                                  ...p,
                                  prepaymentPercent: pct,
                                  prepaymentAmount:
                                    p.vehiclePrice > 0
                                      ? calculateAmountFromPercent(pct, p.vehiclePrice)
                                      : p.prepaymentAmount,
                                }));
                              }}
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="수수료 (금액 / %)">
                        <div className="flex flex-wrap gap-2">
                          <input
                            inputMode="numeric"
                            className="crm-field min-w-[140px] flex-1 text-right tabular-nums"
                            placeholder="금액"
                            value={quoteDraft.feeAmount ? formatWonInput(quoteDraft.feeAmount) : ""}
                            onChange={(e) => {
                              const amt = parseDigitsToInt(e.target.value);
                              setQuoteDraft((p) => ({
                                ...p,
                                feeAmount: amt,
                                feePercent:
                                  p.vehiclePrice > 0
                                    ? calculatePercentFromAmount(amt, p.vehiclePrice)
                                    : 0,
                              }));
                            }}
                          />
                          <div className="flex min-w-[100px] max-w-[120px] flex-1 items-center gap-1">
                            <input
                              inputMode="decimal"
                              className="crm-field min-w-0 flex-1 text-right tabular-nums"
                              disabled={quoteDraft.vehiclePrice <= 0}
                              placeholder="%"
                              value={quoteDraft.feePercent === 0 ? "" : quoteDraft.feePercent}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === "") {
                                  setQuoteDraft((p) => ({ ...p, feePercent: 0 }));
                                  return;
                                }
                                const pct = parsePercentInput(raw);
                                setQuoteDraft((p) => ({
                                  ...p,
                                  feePercent: pct,
                                  feeAmount:
                                    p.vehiclePrice > 0
                                      ? calculateAmountFromPercent(pct, p.vehiclePrice)
                                      : p.feeAmount,
                                }));
                              }}
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <Field label="월 납입금 (원)">
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        value={quoteDraft.monthlyPayment ? formatWonInput(quoteDraft.monthlyPayment) : ""}
                        onChange={(e) =>
                          setQuoteDraft((p) => ({
                            ...p,
                            monthlyPayment: parseDigitsToInt(e.target.value),
                          }))
                        }
                        className="crm-field text-right tabular-nums"
                        placeholder="0"
                      />
                    </Field>
                    <Field label="정비 포함">
                      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          checked={quoteDraft.maintenanceIncluded}
                          onChange={(e) =>
                            setQuoteDraft((p) => ({ ...p, maintenanceIncluded: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        포함
                      </label>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="비고">
                        <textarea
                          value={quoteDraft.note}
                          onChange={(e) => setQuoteDraft((p) => ({ ...p, note: e.target.value }))}
                          rows={2}
                          className="crm-field resize-none"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button type="submit" className="crm-btn-primary disabled:opacity-50" disabled={saving}>
                        {saving ? "저장 중…" : "견적 저장"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {activeTab === "contract" ? (
              <ContractTab
                draft={draft}
                readOnlyContract={staffContractLocked}
                saving={saving}
                onSave={(nextContract, nextStatus) => void saveContract(nextContract, nextStatus)}
              />
            ) : null}

            {activeTab === "export" ? (
              <ExportTab
                draft={draft}
                saving={saving}
                onSave={(nextExport, nextStatus) => void saveExport(nextExport, nextStatus)}
              />
            ) : null}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
      <AiCounselAssistPopup lead={draft} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      {children}
    </label>
  );
}

function ContractTab({
  draft,
  readOnlyContract,
  saving = false,
  onSave,
}: {
  draft: Lead;
  readOnlyContract?: boolean;
  saving?: boolean;
  onSave: (nextContract: ContractInfo | null, nextStatus?: CounselingStatus) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("edit");
  useEffect(() => {
    if (!draft.contract) window.setTimeout(() => setMode("edit"), 0);
  }, [draft.contract]);
  useEffect(() => {
    if (readOnlyContract) window.setTimeout(() => setMode("view"), 0);
  }, [readOnlyContract]);

  const [local, setLocal] = useState<ContractInfo>(
    draft.contract ?? {
      contractDate: new Date().toISOString().slice(0, 10),
      customerCommitmentDate: new Date().toISOString().slice(0, 10),
      product: "장기렌트",
      vehicleName: "",
      vehiclePrice: 0,
      monthlyPayment: 0,
      contractTerm: draft.base.contractTerm || "36개월",
      depositAmount: 0,
      depositPercent: 0,
      depositOrPrepayment: "",
      prepaymentSupportAmount: 0,
      suppliesSupportContent: "",
      suppliesSupportAmount: 0,
      totalSupportCost: 0,
      note: "",
      fee: 0,
      feePercent: 0,
      profitMemo: "",
      pickupPlannedAt: new Date().toISOString().slice(0, 10),
      deliveryType: "",
    }
  );

  useEffect(() => {
    const c = draft.contract;
    const term = draft.base.contractTerm || "36개월";
    window.setTimeout(() => {
      if (c) {
        const normalized = sanitizeContractForSave(c, term);
        console.log("normalized contract form:", normalized);
        setLocal(normalized);
      }
      else {
        const today = new Date().toISOString().slice(0, 10);
        const normalized = sanitizeContractForSave(
            {
              contractDate: today,
              customerCommitmentDate: today,
              product: "장기렌트",
              vehicleName: "",
              vehiclePrice: 0,
              monthlyPayment: 0,
              contractTerm: term,
              depositAmount: 0,
              depositPercent: 0,
              depositOrPrepayment: "",
              prepaymentSupportAmount: 0,
              suppliesSupportContent: "",
              suppliesSupportAmount: 0,
              totalSupportCost: 0,
              note: "",
              fee: 0,
              feePercent: 0,
              profitMemo: "",
              pickupPlannedAt: today,
              deliveryType: "",
            },
            term
          );
        console.log("normalized contract form:", normalized);
        setLocal(normalized);
      }
    }, 0);
  }, [draft.contract, draft.base.contractTerm]);

  const products: LeaseProduct[] = ["장기렌트", "운용리스", "금융리스"];

  /** 선납금 등 확장 전: 보증금 합계만 (추후 항목 합산 구조로 확장 가능) */
  const totalInitialCost = useMemo(() => {
    const d = local.depositAmount;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : 0;
  }, [local.depositAmount]);

  const fieldDisabled = !!readOnlyContract || mode === "view";

  const latestQuote = useMemo(() => {
    const qh = draft.quoteHistory ?? [];
    if (qh.length === 0) return null;
    return [...qh].sort((a, b) => b.quotedAt.localeCompare(a.quotedAt))[0] ?? null;
  }, [draft.quoteHistory]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">계약 고객 관리</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            장기렌트/운용리스/금융리스 계약 정보를 입력합니다.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latestQuote && !readOnlyContract && mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                const term = draft.base.contractTerm || "36개월";
                const patch = contractPartialFromLatestQuote(latestQuote);
                setLocal((prev) => sanitizeContractForSave({ ...prev, ...patch }, term));
                toast.success("최신 견적 내용을 계약 정보에 반영했습니다.");
              }}
              className="crm-btn-secondary py-1.5 text-xs"
            >
              최신 견적 금액 반영
            </button>
          ) : null}
          {readOnlyContract ? null : (
            <button
              type="button"
              onClick={() => setMode((p) => (p === "edit" ? "view" : "edit"))}
              className="crm-btn-secondary py-1.5 text-xs"
            >
              {mode === "edit" ? "보기 전환" : "편집 전환"}
            </button>
          )}
        </div>
      </div>

      {readOnlyContract ? (
        <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
          직원 권한으로 계약 내용은 <strong>조회만</strong> 가능합니다. 저장·삭제는 매니저·관리자만 할 수 있습니다.
        </div>
      ) : null}

      {shouldPersistContractAmountSnapshot(draft.counselingStatus) && draft.contract && !hasLockedMonetarySnapshot(local) ? (
        <div className="rounded-lg border border-sky-200/90 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-100">
          상담결과가 <strong>확정</strong> 또는 <strong>출고</strong>입니다. 계약 저장 시 차량가·보증금·수수료가 최종 스냅샷으로
          고정되며, 이후 견적·금액을 바꿔도 스냅샷은 유지됩니다. 출고 유형은 비어 있으면 다음 저장 때만 보완할 수 있습니다.
        </div>
      ) : null}

      {hasLockedMonetarySnapshot(local) || hasFinalDeliverySnapshot(local) ? (
        <div className="rounded-xl border border-violet-200/90 bg-violet-50/60 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-950/25">
          <div className="flex flex-wrap items-center gap-2">
            {hasLockedMonetarySnapshot(local) ? (
              <span className="inline-flex items-center rounded-full border border-violet-300/90 bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:border-violet-500/40 dark:bg-violet-950/50 dark:text-violet-200">
                최종 확정 금액
              </span>
            ) : null}
            {hasFullContractAmountSnapshot(local) ? (
              <span className="text-xs text-violet-800/90 dark:text-violet-200/90">
                최종 확정값 저장 완료 · 확정 스냅샷 유지 중
              </span>
            ) : hasLockedMonetarySnapshot(local) && !hasFinalDeliverySnapshot(local) ? (
              <span className="text-xs text-violet-800/90 dark:text-violet-200/90">
                금액 스냅샷 유지 중 · 출고 유형만 선택 후 저장하면 반영됩니다
              </span>
            ) : (
              <span className="text-xs text-violet-800/90 dark:text-violet-200/90">
                확정 스냅샷 일부만 저장됨
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-violet-900/75 dark:text-violet-200/70">
            아래 값은 조회 전용입니다. 편집되는 계약 금액과 구분되는 <strong>최초 확정 기준</strong>입니다.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-500/25 dark:bg-zinc-900/40">
              <dt className="text-[11px] font-medium text-violet-700/90 dark:text-violet-300/90">최종 차량가</dt>
              <dd className="mt-0.5 tabular-nums text-sm text-zinc-800 dark:text-zinc-100">
                {local.finalVehiclePrice != null && Number.isFinite(local.finalVehiclePrice)
                  ? `${formatWonInput(local.finalVehiclePrice)}원`
                  : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-500/25 dark:bg-zinc-900/40">
              <dt className="text-[11px] font-medium text-violet-700/90 dark:text-violet-300/90">최종 보증금</dt>
              <dd className="mt-0.5 tabular-nums text-sm text-zinc-800 dark:text-zinc-100">
                {local.finalDepositAmount != null && Number.isFinite(local.finalDepositAmount)
                  ? `${formatWonInput(local.finalDepositAmount)}원`
                  : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-500/25 dark:bg-zinc-900/40">
              <dt className="text-[11px] font-medium text-violet-700/90 dark:text-violet-300/90">최종 수수료</dt>
              <dd className="mt-0.5 tabular-nums text-sm text-zinc-800 dark:text-zinc-100">
                {local.finalFeeAmount != null && Number.isFinite(local.finalFeeAmount)
                  ? `${formatWonInput(local.finalFeeAmount)}원`
                  : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-500/25 dark:bg-zinc-900/40">
              <dt className="text-[11px] font-medium text-violet-700/90 dark:text-violet-300/90">최종 출고 유형</dt>
              <dd className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-100">
                {local.finalDeliveryType === "대리점 출고" || local.finalDeliveryType === "특판 출고"
                  ? local.finalDeliveryType
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="계약일">
          <input
            type="date"
            value={local.contractDate}
            onChange={(e) => setLocal((p) => ({ ...p, contractDate: e.target.value }))}
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>
        <Field label="계약 상품">
          <select
            value={local.product}
            onChange={(e) => setLocal((p) => ({ ...p, product: e.target.value as LeaseProduct }))}
            className="crm-field crm-field-select"
            disabled={fieldDisabled}
          >
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="고객 약정일">
          <input
            type="date"
            value={local.customerCommitmentDate}
            onChange={(e) =>
              setLocal((p) => ({ ...p, customerCommitmentDate: e.target.value }))
            }
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        <Field label="계약 차량명">
          <input
            value={local.vehicleName}
            onChange={(e) => setLocal((p) => ({ ...p, vehicleName: e.target.value }))}
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        <Field label="차량가 (원)">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={local.vehiclePrice ? formatWonInput(local.vehiclePrice) : ""}
            onChange={(e) => {
              const vp = parseDigitsToInt(e.target.value);
              setLocal((p) => {
                const next: ContractInfo = { ...p, vehiclePrice: vp };
                if (vp <= 0) return next;
                if (p.depositPercent > 0) {
                  next.depositAmount = calculateAmountFromPercent(p.depositPercent, vp);
                } else if (p.depositAmount > 0) {
                  next.depositPercent = calculatePercentFromAmount(p.depositAmount, vp);
                }
                if (p.feePercent > 0) {
                  next.fee = calculateAmountFromPercent(p.feePercent, vp);
                } else if (p.fee > 0) {
                  next.feePercent = calculatePercentFromAmount(p.fee, vp);
                }
                return next;
              });
            }}
            placeholder="0"
            className="crm-field"
            disabled={fieldDisabled}
          />
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            보증금·수수료 % 계산 기준입니다.
          </div>
        </Field>

        <Field label="월 납입금 (원)">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={local.monthlyPayment ? formatWonInput(local.monthlyPayment) : ""}
            onChange={(e) =>
              setLocal((p) => ({ ...p, monthlyPayment: parseDigitsToInt(e.target.value) }))
            }
            className="crm-field"
            placeholder="0"
            disabled={fieldDisabled}
          />
        </Field>

        <Field label="계약기간">
          <select
            value={
              (BASE_CONTRACT_TERM_OPTIONS as readonly string[]).includes(local.contractTerm)
                ? local.contractTerm
                : local.contractTerm
            }
            onChange={(e) => setLocal((p) => ({ ...p, contractTerm: e.target.value }))}
            className="crm-field crm-field-select"
            disabled={fieldDisabled}
          >
            {(BASE_CONTRACT_TERM_OPTIONS as readonly string[]).includes(local.contractTerm) ? null : (
              <option value={local.contractTerm}>{local.contractTerm} (현재 저장값)</option>
            )}
            {BASE_CONTRACT_TERM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="보증금/선납금">
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              inputMode="numeric"
              autoComplete="off"
              className="crm-field min-w-[140px] flex-1"
              disabled={fieldDisabled}
              placeholder="금액"
              value={local.depositAmount ? formatWonInput(local.depositAmount) : ""}
              onChange={(e) => {
                const amt = parseDigitsToInt(e.target.value);
                setLocal((p) => ({
                  ...p,
                  depositAmount: amt,
                  depositPercent:
                    p.vehiclePrice > 0
                      ? calculatePercentFromAmount(amt, p.vehiclePrice)
                      : p.depositPercent,
                }));
              }}
            />
            <div className="flex min-w-[100px] max-w-[140px] flex-1 items-center gap-1">
              <input
                inputMode="decimal"
                autoComplete="off"
                className="crm-field min-w-0 flex-1 text-right tabular-nums"
                disabled={fieldDisabled || local.vehiclePrice <= 0}
                placeholder="%"
                title={
                  local.vehiclePrice <= 0
                    ? "차량가를 먼저 입력하면 %를 사용할 수 있습니다."
                    : "차량가 대비 %"
                }
                value={local.depositPercent === 0 ? "" : local.depositPercent}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    setLocal((p) => ({ ...p, depositPercent: 0 }));
                    return;
                  }
                  const pct = parsePercentInput(raw);
                  setLocal((p) => ({
                    ...p,
                    depositPercent: pct,
                    depositAmount:
                      p.vehiclePrice > 0
                        ? calculateAmountFromPercent(pct, p.vehiclePrice)
                        : p.depositAmount,
                  }));
                }}
              />
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">%</span>
            </div>
          </div>
          {local.vehiclePrice <= 0 ? (
            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300/90">
              차량가 입력 후 퍼센트로 자동 계산할 수 있습니다.
            </div>
          ) : null}
          {local.depositOrPrepayment &&
          formatDepositDbLine(local.depositAmount, local.depositPercent) !==
            local.depositOrPrepayment.trim() ? (
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              DB 요약: {local.depositOrPrepayment}
            </div>
          ) : null}
        </Field>

        <Field label="총 초기비용">
          <div className="crm-field bg-zinc-50 text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
            {totalInitialCost ? formatWonInput(totalInitialCost) : "0"}원
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            현재는 보증금/선납금 금액과 동일합니다. (추후 선납금 등 항목 합산 예정)
          </div>
        </Field>

        <Field label="수수료">
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              inputMode="numeric"
              autoComplete="off"
              className="crm-field min-w-[140px] flex-1"
              disabled={fieldDisabled}
              placeholder="금액"
              value={local.fee ? formatWonInput(local.fee) : ""}
              onChange={(e) => {
                const v = parseDigitsToInt(e.target.value);
                setLocal((p) => ({
                  ...p,
                  fee: v,
                  feePercent:
                    p.vehiclePrice > 0
                      ? calculatePercentFromAmount(v, p.vehiclePrice)
                      : p.feePercent,
                }));
              }}
            />
            <div className="flex min-w-[100px] max-w-[140px] flex-1 items-center gap-1">
              <input
                inputMode="decimal"
                autoComplete="off"
                className="crm-field min-w-0 flex-1 text-right tabular-nums"
                disabled={fieldDisabled || local.vehiclePrice <= 0}
                placeholder="%"
                title={
                  local.vehiclePrice <= 0
                    ? "차량가를 먼저 입력하면 %를 사용할 수 있습니다."
                    : "차량가 대비 %"
                }
                value={local.feePercent === 0 ? "" : local.feePercent}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    setLocal((p) => ({ ...p, feePercent: 0 }));
                    return;
                  }
                  const pct = parsePercentInput(raw);
                  setLocal((p) => ({
                    ...p,
                    feePercent: pct,
                    fee:
                      p.vehiclePrice > 0
                        ? calculateAmountFromPercent(pct, p.vehiclePrice)
                        : p.fee,
                  }));
                }}
              />
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">%</span>
            </div>
          </div>
        </Field>

        <Field label="출고 유형">
          <select
            value={local.deliveryType}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                deliveryType: e.target.value as ContractInfo["deliveryType"],
              }))
            }
            className="crm-field crm-field-select"
            disabled={fieldDisabled}
          >
            <option value="">선택</option>
            {DELIVERY_TYPE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="선납금 지원금액">
          <input
            type="number"
            value={local.prepaymentSupportAmount || ""}
            onChange={(e) =>
              setLocal((p) => {
                const v = Number(e.target.value) || 0;
                return { ...p, prepaymentSupportAmount: v, totalSupportCost: v + p.suppliesSupportAmount };
              })
            }
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        <Field label="용품지원 금액">
          <input
            type="number"
            value={local.suppliesSupportAmount || ""}
            onChange={(e) =>
              setLocal((p) => {
                const v = Number(e.target.value) || 0;
                return { ...p, suppliesSupportAmount: v, totalSupportCost: p.prepaymentSupportAmount + v };
              })
            }
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        <Field label="총 지원 비용">
          <input
            type="number"
            value={local.totalSupportCost || ""}
            onChange={(e) =>
              setLocal((p) => ({ ...p, totalSupportCost: Number(e.target.value) || 0 }))
            }
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="용품지원 내용">
            <input
              value={local.suppliesSupportContent}
              onChange={(e) =>
                setLocal((p) => ({ ...p, suppliesSupportContent: e.target.value }))
              }
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="수익 메모">
            <textarea
              value={local.profitMemo}
              onChange={(e) => setLocal((p) => ({ ...p, profitMemo: e.target.value }))}
              rows={3}
              className="crm-field resize-none"
              disabled={fieldDisabled}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="비고">
            <textarea
              value={local.note}
              onChange={(e) => setLocal((p) => ({ ...p, note: e.target.value }))}
              rows={3}
              className="crm-field resize-none"
              disabled={fieldDisabled}
            />
          </Field>
        </div>

        <Field label="출고 예정일">
          <input
            type="date"
            value={local.pickupPlannedAt}
            onChange={(e) => setLocal((p) => ({ ...p, pickupPlannedAt: e.target.value }))}
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onSave(local, "계약완료")}
          disabled={fieldDisabled || saving}
          className="crm-btn-primary disabled:opacity-50"
        >
          {saving ? "저장 중…" : "계약 저장"}
        </button>
        {draft.contract ? (
          <button
            type="button"
            onClick={() => onSave(null, "상담중")}
            disabled={fieldDisabled || saving}
            className="crm-btn-secondary disabled:opacity-50"
          >
            계약 삭제
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ExportTab({
  draft,
  saving = false,
  onSave,
}: {
  draft: Lead;
  saving?: boolean;
  onSave: (nextExport: ExportProgress | null, nextStatus?: CounselingStatus) => void | Promise<void>;
}) {
  const [exportMode, setExportMode] = useState<"edit" | "view">("edit");

  useEffect(() => {
    if (!draft.exportProgress) window.setTimeout(() => setExportMode("edit"), 0);
  }, [draft.exportProgress]);

  const [local, setLocal] = useState<ExportProgress>(draft.exportProgress ?? EXPORT_TAB_INITIAL);

  useEffect(() => {
    const p = draft.exportProgress;
    window.setTimeout(() => {
      if (p) setLocal(p);
      else setLocal(EXPORT_TAB_INITIAL);
    }, 0);
  }, [draft.exportProgress]);

  const exportStages: ExportStage[] = [
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

  const fieldDisabled = exportMode === "view";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">출고 진행 상태</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            발주/전자약정/탁송/인도 단계를 단계별로 관리합니다.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExportMode((p) => (p === "edit" ? "view" : "edit"))}
          className="crm-btn-secondary py-1.5 text-xs"
        >
          {exportMode === "edit" ? "보기 전환" : "편집 전환"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="출고 단계">
          <select
            value={local.stage}
            onChange={(e) => setLocal((p) => ({ ...p, stage: e.target.value as ExportStage }))}
            className={cn(
              "crm-field crm-field-select",
              exportStagePillClass(local.stage)
            )}
            disabled={fieldDisabled}
          >
            {exportStages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="인도 완료일(인도 완료일 때)">
          <input
            type="date"
            value={toDateInputValue(local.deliveredAt)}
            onChange={(e) => {
              const v = e.target.value;
              setLocal((p) => ({ ...p, deliveredAt: v ? fromDateInputValue(v) : null }));
            }}
            className="crm-field"
            disabled={fieldDisabled}
          />
        </Field>

        {local.stage !== "계약완료" ? (
          <Field label="발주일">
            <input
              type="date"
              value={toDateInputValue(local.orderDate)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((p) => ({ ...p, orderDate: v ? fromDateInputValue(v) : undefined }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="차종">
            <input
              value={local.vehicleModel ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, vehicleModel: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="등급/트림">
            <input
              value={local.trim ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, trim: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="옵션">
            <input
              value={local.options ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, options: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="색상">
            <input
              value={local.color ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, color: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="대리점명">
            <input
              value={local.dealerName ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, dealerName: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="담당 딜러명">
            <input
              value={local.dealerStaffName ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, dealerStaffName: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="진행 금융사">
            <input
              value={local.financeCompany ?? ""}
              onChange={(e) => setLocal((p) => ({ ...p, financeCompany: e.target.value }))}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="차량 계약번호">
            <input
              value={local.vehicleContractNumber ?? ""}
              onChange={(e) =>
                setLocal((p) => ({ ...p, vehicleContractNumber: e.target.value }))
              }
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="고객 약정일">
            <input
              type="date"
              value={toDateInputValue(local.customerCommitmentDate)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((p) => ({
                  ...p,
                  customerCommitmentDate: v ? fromDateInputValue(v) : undefined,
                }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="인도 예정일">
            <input
              type="date"
              value={toDateInputValue(local.expectedDeliveryDate)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((p) => ({
                  ...p,
                  expectedDeliveryDate: v ? fromDateInputValue(v) : undefined,
                }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="실제 인도일">
            <input
              type="date"
              value={toDateInputValue(local.actualDeliveryDate)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((prev) => ({
                  ...prev,
                  actualDeliveryDate: v ? fromDateInputValue(v) : null,
                  deliveredAt: v ? fromDateInputValue(v) : prev.deliveredAt,
                }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="발주 요청일(옵션)">
            <input
              type="date"
              value={toDateInputValue(local.orderRequestedAt)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((p) => ({ ...p, orderRequestedAt: v ? fromDateInputValue(v) : undefined }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <Field label="전자약정 완료일(옵션)">
            <input
              type="date"
              value={toDateInputValue(local.eContractCompletedAt)}
              onChange={(e) => {
                const v = e.target.value;
                setLocal((p) => ({ ...p, eContractCompletedAt: v ? fromDateInputValue(v) : undefined }));
              }}
              className="crm-field"
              disabled={fieldDisabled}
            />
          </Field>
        ) : null}

        {local.stage !== "계약완료" ? (
          <div className="sm:col-span-2">
            <Field label="특이사항 메모">
              <textarea
                value={local.specialNote ?? ""}
                onChange={(e) => setLocal((p) => ({ ...p, specialNote: e.target.value }))}
                rows={3}
                className="crm-field resize-none"
                disabled={fieldDisabled}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={async () => {
            const msg = validateExportBeforeSave(local);
            if (msg) {
              toast.error(msg);
              return;
            }
            const payload: ExportProgress = {
              ...local,
              deliveredAt:
                local.stage === "인도 완료"
                  ? local.actualDeliveryDate ?? local.deliveredAt ?? null
                  : local.deliveredAt ?? null,
            };
            try {
              await onSave(
                payload,
                counselingStatusFromExportProgress(payload, !!draft.contract)
              );
            } catch {
              /* 부모에서 alert·로그 */
            }
          }}
          disabled={fieldDisabled || saving}
          className="crm-btn-primary disabled:opacity-50"
        >
          {saving ? "저장 중…" : "출고 저장"}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await onSave(
                null,
                counselingStatusFromExportProgress(null, !!draft.contract)
              );
              setLocal(EXPORT_TAB_INITIAL);
              setExportMode("edit");
            } catch {
              /* 부모에서 이미 alert */
            }
          }}
          disabled={fieldDisabled || saving}
          className="crm-btn-secondary disabled:opacity-50"
        >
          출고 초기화
        </button>
      </div>
    </div>
  );
}

