import { effectiveContractFeeForMetrics } from "./leaseCrmContractPersist";
import type {
  CounselingStatus,
  ExportProgress,
  ExportStage,
  Lead,
  LeadCategoryKey,
} from "./leaseCrmTypes";

/** 계약·출고 파이프라인(계약 진행 고객 등)에 포함되는 상담결과 */
export function isContractPipelineCounselingStatus(s: CounselingStatus): boolean {
  return s === "계약완료" || s === "확정" || s === "출고";
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
        counselingStatus: "계약완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("발주 요청"),
        contract: null,
        deliveredAt: null,
      };
    case "delivery-complete":
      return {
        counselingStatus: "계약완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("인도 완료", { deliveredAt: nowIso }),
        contract: null,
        deliveredAt: nowIso,
      };
    case "aftercare":
      return {
        counselingStatus: "계약완료",
        nextContactAt: null,
        nextContactMemo: "",
        exportProgress: minimalExport("인도 완료", { deliveredAt: deliveredPast }),
        contract: null,
        deliveredAt: deliveredPast,
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
      return leads.filter(
        (l) =>
          l.counselingStatus === "부재" ||
          (l.counselingStatus === "상담중" && !l.nextContactAt)
      );
    case "contract-progress":
      return leads.filter(
        (l) =>
          isContractPipelineCounselingStatus(l.counselingStatus) &&
          (!l.exportProgress || exportStageIndex(l.exportProgress.stage) < exportStageIndex("인도 완료"))
      );
    case "export-progress":
      return leads.filter(
        (l) =>
          !!l.exportProgress &&
          exportStageIndex(l.exportProgress.stage) >= exportStageIndex("발주 요청") &&
          exportStageIndex(l.exportProgress.stage) < exportStageIndex("인도 완료")
      );
    case "delivery-complete":
      return leads.filter(
        (l) => l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt
      );
    case "aftercare":
      return leads.filter((l) => {
        const delivered = l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt;
        if (!delivered) return false;
        if (!l.deliveredAt) return false;
        return isAfterDays(l.deliveredAt, 90);
      });
    default:
      return [];
  }
}

/**
 * 출고 저장 시 상담결과(진행단계와 구분). ExportStage 첫 단계명 `계약완료`와 혼동 주의.
 */
export function counselingStatusFromExportProgress(
  exp: ExportProgress | null,
  hasContract: boolean
): CounselingStatus {
  if (!exp) return hasContract ? "계약완료" : "상담중";
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
      (l.exportProgress?.stage === "인도 완료" || !!l.deliveredAt)
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
      !l.deliveredAt
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
    .reduce((sum, l) => sum + effectiveContractFeeForMetrics(l.contract!), 0);

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
    staff: Array.from(staff.values()).sort((a, b) => b.counselingCount - a.counselingCount),
    unprocessedNewDb: automation.unprocessedNewDb,
    followUpPlanned: leads.filter((l) => l.counselingStatus === "상담중" && !!l.nextContactAt).length,
    unresponsive: leads.filter(
      (l) =>
        l.counselingStatus === "부재" ||
        (l.counselingStatus === "상담중" && !l.nextContactAt)
    ).length,
    exportInProgress: leads.filter((l) => computeCategory([l], "export-progress").length === 1).length,
    automation,
    abandoned7days: automation.abandoned7days,
    staffPipeline: computeStaffPipelineBreakdown(leads),
    sourceFunnel: computeSourceFunnelMetrics(leads),
  };
}

