import type { Lead } from "./leaseCrmTypes";

export const COUNSEL_ASSIST_UI_TONES = ["친절형", "설득형", "단호형", "대표형"] as const;
export type CounselAssistUiTone = (typeof COUNSEL_ASSIST_UI_TONES)[number];

export const COUNSEL_ASSIST_PURPOSES = [
  "첫인사",
  "재컨택",
  "견적안내",
  "프로모션안내",
  "클로징",
  "이탈방지",
  "장기미응답",
  "문자카톡용(짧게)",
  "추가혜택안내",
  "계약후감사",
  "소개요청",
  "출고안내",
  "경쟁사대응",
] as const;
export type CounselAssistPurpose = (typeof COUNSEL_ASSIST_PURPOSES)[number];

export const COUNSEL_ASSIST_OBJECTION_OPTIONS = [
  "가격이 비싸다",
  "타사 비교 중이다",
  "가족/배우자와 상의해야 한다",
  "아직 급하지 않다",
  "초기비용이 부담된다",
  "신용이 걱정된다",
  "출고가 오래 걸릴까 걱정된다",
  "계약이 불안하다",
  "생각해보고 연락주겠다",
  "지금 차를 더 탈 수 있다",
] as const;
export type CounselAssistObjection = (typeof COUNSEL_ASSIST_OBJECTION_OPTIONS)[number];

export const COUNSEL_ASSIST_CHANNEL_OPTIONS = ["전화", "문자", "카톡", "방문"] as const;
export type CounselAssistChannel = (typeof COUNSEL_ASSIST_CHANNEL_OPTIONS)[number];

export type CounselAssistManualInput = {
  reactionSummary: string;
  objections: CounselAssistObjection[];
  objectionsFreeText: string;
  budgetSensitive: boolean;
  desiredVehicle: string;
  alternativeVehicle: string;
  upfrontBudgetRange: string;
  urgency: "급함" | "보통" | "낮음";
  recentChannel: CounselAssistChannel;
  lastCustomerReaction: string;
};

export type CounselAssistRequestOptions = {
  uiTone: CounselAssistUiTone;
  purpose: CounselAssistPurpose;
};

/** Serialized lead snapshot for counsel-assist API (validated on server). */
export type CounselAssistContextPayload = {
  leadId: string;
  managerUserId?: string | null;
  base: {
    name: string;
    phone: string;
    desiredVehicle: string;
    source: string;
    leadTemperature: string;
    customerType: string;
    contractTerm: string;
    wantedMonthlyPayment: number;
    depositOrPrepaymentAmount: string;
    memo: string;
    ownerStaff: string;
  };
  status: {
    counselingStatus: string;
    leadPriority: string;
    creditReviewStatus: string;
    failureReason: string;
    failureReasonNote: string;
  };
  timeline: {
    createdAt: string;
    lastHandledAt: string;
    nextContactAt: string | null;
    nextContactMemo: string;
    statusUpdatedAt: string;
  };
  counselingRecords: Array<{
    occurredAt: string;
    method: string;
    counselor: string;
    content: string;
    reaction: string;
    desiredProgressAt: string;
    nextContactAt: string;
    nextContactMemo: string;
    importance: string;
  }>;
  quoteHistory: Array<{
    quotedAt: string;
    productType: string;
    financeCompany: string;
    vehicleModel: string;
    contractTerm: string;
    monthlyPayment: number;
    depositAmount: number;
    prepaymentAmount: number;
    maintenanceIncluded: boolean;
    note: string;
  }>;
  contract: null | {
    contractDate: string;
    product: string;
    vehicleName: string;
    vehiclePrice: number;
    monthlyPayment: number;
    contractTerm: string;
    depositAmount: number;
    pickupPlannedAt: string;
    note: string;
  };
  exportProgress: null | {
    stage: string;
    expectedDeliveryDate?: string;
    vehicleModel?: string;
    financeCompany?: string;
    deliveredAt?: string | null;
  };
};

export const COUNSEL_ASSIST_MESSAGE_TONES = ["부담 완화형", "신뢰 확보형", "마감 유도형"] as const;
export type CounselAssistMessageTone = (typeof COUNSEL_ASSIST_MESSAGE_TONES)[number];

export type CounselAssistResult = {
  summary: string[];
  customerStage: string;
  purchaseIntentScore: number;
  priceSensitivityScore: number;
  responseRiskScore: number;
  riskSignals: string[];
  recommendedAction: string;
  recommendedActions: string[];
  messageSuggestions: Array<{
    tone: CounselAssistMessageTone;
    text: string;
  }>;
  oneLineReply: string;
  nextQuestions: string[];
  talkPoints: string[];
  cautionPhrases: string[];
  conversionLikelihoodNote: string;
  pushOrPauseAdvice: string;
};

export type AiCounselAnalysisRecord = {
  id?: string;
  leadId: string;
  generatedBy: string;
  tone: CounselAssistUiTone;
  purpose: CounselAssistPurpose;
  inputSnapshot: {
    context: CounselAssistContextPayload;
    manual: CounselAssistManualInput;
  };
  summary: string[];
  scores: {
    purchaseIntentScore: number;
    priceSensitivityScore: number;
    responseRiskScore: number;
  };
  recommendedAction: string;
  messageSuggestions: CounselAssistResult["messageSuggestions"];
  createdAt: string;
};

export function defaultCounselAssistManualInput(lead?: Lead | null): CounselAssistManualInput {
  return {
    reactionSummary: "",
    objections: [],
    objectionsFreeText: "",
    budgetSensitive: false,
    desiredVehicle: lead?.base.desiredVehicle ?? "",
    alternativeVehicle: "",
    upfrontBudgetRange: lead?.base.depositOrPrepaymentAmount ?? "",
    urgency: "보통",
    recentChannel: "카톡",
    lastCustomerReaction: "",
  };
}

export function defaultCounselAssistRequestOptions(): CounselAssistRequestOptions {
  return {
    uiTone: "친절형",
    purpose: "재컨택",
  };
}

const MAX_RECORD_CONTENT = 900;
const MAX_RECORDS = 14;
const MAX_QUOTES = 5;

function trimText(s: string, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function buildCounselAssistPayload(lead: Lead): CounselAssistContextPayload {
  const records = [...(lead.counselingRecords ?? [])]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, MAX_RECORDS)
    .map((r) => ({
      occurredAt: r.occurredAt,
      method: r.method,
      counselor: r.counselor,
      content: trimText(r.content, MAX_RECORD_CONTENT),
      reaction: trimText(r.reaction, 400),
      desiredProgressAt: r.desiredProgressAt,
      nextContactAt: r.nextContactAt,
      nextContactMemo: trimText(r.nextContactMemo, 300),
      importance: r.importance,
    }));

  const quotes = [...(lead.quoteHistory ?? [])]
    .sort((a, b) => (a.quotedAt < b.quotedAt ? 1 : -1))
    .slice(0, MAX_QUOTES)
    .map((q) => ({
      quotedAt: q.quotedAt,
      productType: q.productType,
      financeCompany: trimText(q.financeCompany, 120),
      vehicleModel: trimText(q.vehicleModel, 200),
      contractTerm: q.contractTerm,
      monthlyPayment: q.monthlyPayment,
      depositAmount: q.depositAmount,
      prepaymentAmount: q.prepaymentAmount,
      maintenanceIncluded: q.maintenanceIncluded,
      note: trimText(q.note, 400),
    }));

  const c = lead.contract;
  const contract = c
    ? {
        contractDate: c.contractDate,
        product: c.product,
        vehicleName: trimText(c.vehicleName, 200),
        vehiclePrice: c.vehiclePrice,
        monthlyPayment: c.monthlyPayment,
        contractTerm: c.contractTerm,
        depositAmount: c.depositAmount,
        pickupPlannedAt: c.pickupPlannedAt,
        note: trimText(c.note, 500),
      }
    : null;

  const ex = lead.exportProgress;
  const exportProgress = ex
    ? {
        stage: ex.stage,
        expectedDeliveryDate: ex.expectedDeliveryDate,
        vehicleModel: ex.vehicleModel,
        financeCompany: ex.financeCompany,
        deliveredAt: ex.deliveredAt ?? null,
      }
    : null;

  return {
    leadId: lead.id,
    managerUserId: lead.managerUserId ?? null,
    base: {
      name: trimText(lead.base.name, 80),
      phone: trimText(lead.base.phone, 40),
      desiredVehicle: trimText(lead.base.desiredVehicle, 200),
      source: trimText(lead.base.source, 120),
      leadTemperature: lead.base.leadTemperature,
      customerType: lead.base.customerType,
      contractTerm: trimText(lead.base.contractTerm, 40),
      wantedMonthlyPayment: lead.base.wantedMonthlyPayment,
      depositOrPrepaymentAmount: trimText(lead.base.depositOrPrepaymentAmount, 80),
      memo: trimText(lead.base.memo, 1500),
      ownerStaff: trimText(lead.base.ownerStaff, 80),
    },
    status: {
      counselingStatus: lead.counselingStatus,
      leadPriority: lead.leadPriority,
      creditReviewStatus: lead.creditReviewStatus,
      failureReason: trimText(lead.failureReason, 200),
      failureReasonNote: trimText(lead.failureReasonNote, 400),
    },
    timeline: {
      createdAt: lead.createdAt,
      lastHandledAt: lead.lastHandledAt,
      nextContactAt: lead.nextContactAt,
      nextContactMemo: trimText(lead.nextContactMemo, 400),
      statusUpdatedAt: lead.statusUpdatedAt,
    },
    counselingRecords: records,
    quoteHistory: quotes,
    contract,
    exportProgress,
  };
}
