import type { Lead } from "./leaseCrmTypes";

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

export const COUNSEL_ASSIST_MESSAGE_TONES = [
  "\ubd80\ub2f4 \uc644\ud654\ud615",
  "\uc2e0\ub8b0 \ud655\ubcf4\ud615",
  "\ub9c8\uac10 \uc720\ub3c4\ud615",
] as const;

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
};

const MAX_RECORD_CONTENT = 900;
const MAX_RECORDS = 14;
const MAX_QUOTES = 5;

function trimText(s: string, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\u2026`;
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
