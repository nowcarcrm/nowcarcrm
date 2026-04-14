import type {
  CounselingRecord,
  ContractInfo,
  CustomerBase,
  ExportProgress,
  ExportStage,
  LeaseProduct,
  Lead,
} from "./leaseCrmTypes";
import { defaultLeadOperationalFields } from "./leaseCrmTypes";
import {
  amountFromPercent,
  formatDepositDbLine,
  percentFromAmount,
} from "./leaseCrmContractPersist";

const MS_DAY = 1000 * 60 * 60 * 24;

function isoDaysFromNow(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * MS_DAY);
  return d.toISOString();
}

function isoDaysAgo(daysAgo: number) {
  return isoDaysFromNow(-daysAgo);
}

function formatDateOnly(iso: string) {
  // yyyy-mm-dd
  return iso.slice(0, 10);
}

function makeBase(overrides: Partial<CustomerBase>): CustomerBase {
  return {
    name: "고객",
    phone: "010-0000-0000",
    desiredVehicle: "아반떼(견적 기준)",
    source: "네이버",
    leadTemperature: "중",
    customerType: "개인",
    wantedMonthlyPayment: 0,
    contractTerm: "36개월",
    hasDepositOrPrepayment: true,
    depositOrPrepaymentAmount: "100만원",
    ownerStaff: "담당자A",
    memo: "",
    ...overrides,
  };
}

function makeRecord(
  partial: Omit<CounselingRecord, "id"> & { id?: string }
): CounselingRecord {
  return {
    id: partial.id ?? `rec_${Math.random().toString(16).slice(2)}`,
    occurredAt: partial.occurredAt,
    counselor: partial.counselor,
    method: partial.method,
    content: partial.content,
    reaction: partial.reaction,
    desiredProgressAt: partial.desiredProgressAt,
    nextContactAt: partial.nextContactAt,
    nextContactMemo: partial.nextContactMemo,
    importance: partial.importance,
  };
}

function makeContract(partial: Partial<ContractInfo>): ContractInfo {
  const supportAmount = partial.prepaymentSupportAmount ?? 300000;
  const suppliesAmount = partial.suppliesSupportAmount ?? 200000;
  const vehiclePrice = partial.vehiclePrice ?? 42_000_000;
  const depositAmount = partial.depositAmount ?? 1_000_000;
  const fee = partial.fee ?? 180000;
  const depositPercentDefault = percentFromAmount(depositAmount, vehiclePrice);
  const feePercentDefault = percentFromAmount(fee, vehiclePrice);
  const merged: ContractInfo = {
    contractDate: formatDateOnly(isoDaysAgo(12)),
    customerCommitmentDate: formatDateOnly(isoDaysAgo(10)),
    product: "장기렌트" as LeaseProduct,
    vehicleName: "그랜저 하이브리드",
    vehiclePrice,
    monthlyPayment: 420000,
    contractTerm: "36개월",
    depositAmount,
    depositPercent: partial.depositPercent ?? depositPercentDefault,
    depositOrPrepayment:
      partial.depositOrPrepayment ??
      (formatDepositDbLine(depositAmount, partial.depositPercent ?? depositPercentDefault) || ""),
    prepaymentSupportAmount: supportAmount,
    suppliesSupportContent: "썬팅 + 블랙박스",
    suppliesSupportAmount: suppliesAmount,
    totalSupportCost: supportAmount + suppliesAmount,
    note: "초기 프로모션 적용",
    fee,
    feePercent: partial.feePercent ?? feePercentDefault,
    profitMemo: "기본 수익",
    pickupPlannedAt: formatDateOnly(isoDaysFromNow(25)),
    deliveryType: "대리점 출고",
    ...partial,
    dealerAllowance: partial.dealerAllowance ?? 0,
  };
  const vp = merged.vehiclePrice;
  if (vp > 0) {
    if (partial.depositPercent !== undefined && partial.depositAmount === undefined) {
      merged.depositAmount = amountFromPercent(vp, merged.depositPercent);
    } else if (partial.depositAmount !== undefined && partial.depositPercent === undefined) {
      merged.depositPercent = percentFromAmount(merged.depositAmount, vp);
    }
    if (partial.feePercent !== undefined && partial.fee === undefined) {
      merged.fee = amountFromPercent(vp, merged.feePercent);
    } else if (partial.fee !== undefined && partial.feePercent === undefined) {
      merged.feePercent = percentFromAmount(merged.fee, vp);
    }
  }
  if (!String(merged.depositOrPrepayment ?? "").trim() && merged.depositAmount > 0) {
    merged.depositOrPrepayment = formatDepositDbLine(merged.depositAmount, merged.depositPercent);
  }
  return merged;
}

function makeExport(
  stage: ExportStage,
  deliveredAt: string | null,
  partial: Partial<ExportProgress>
): ExportProgress {
  return {
    stage,
    deliveredAt,
    ...partial,
  };
}

export const EMPLOYEES = ["김영업", "박지원", "오세진"] as const;

type SeedSpec = {
  id: string;
  createdAtDaysAgo: number;
  counselingStatus: Lead["counselingStatus"];
  ownerStaff: string;
};

const SEED_SPECS: SeedSpec[] = [
  { id: "lead_001", createdAtDaysAgo: 4, counselingStatus: "신규", ownerStaff: "김영업" },
  { id: "lead_002", createdAtDaysAgo: 2, counselingStatus: "신규", ownerStaff: "박지원" },
  { id: "lead_003", createdAtDaysAgo: 6, counselingStatus: "상담중", ownerStaff: "김영업" },
  { id: "lead_004", createdAtDaysAgo: 7, counselingStatus: "상담중", ownerStaff: "오세진" },
  { id: "lead_005", createdAtDaysAgo: 5, counselingStatus: "상담중", ownerStaff: "박지원" },
  { id: "lead_006", createdAtDaysAgo: 3, counselingStatus: "상담중", ownerStaff: "김영업" },
  { id: "lead_007", createdAtDaysAgo: 8, counselingStatus: "상담중", ownerStaff: "오세진" },
  { id: "lead_008", createdAtDaysAgo: 10, counselingStatus: "부재", ownerStaff: "박지원" },
  { id: "lead_009", createdAtDaysAgo: 12, counselingStatus: "보류", ownerStaff: "김영업" },
  { id: "lead_010", createdAtDaysAgo: 20, counselingStatus: "계약완료", ownerStaff: "박지원" },
  { id: "lead_011", createdAtDaysAgo: 26, counselingStatus: "계약완료", ownerStaff: "오세진" },
  { id: "lead_012", createdAtDaysAgo: 30, counselingStatus: "계약완료", ownerStaff: "김영업" },
  { id: "lead_013", createdAtDaysAgo: 45, counselingStatus: "계약완료", ownerStaff: "김영업" },
  { id: "lead_014", createdAtDaysAgo: 60, counselingStatus: "계약완료", ownerStaff: "오세진" },
  { id: "lead_015", createdAtDaysAgo: 110, counselingStatus: "계약완료", ownerStaff: "박지원" },
  { id: "lead_016", createdAtDaysAgo: 140, counselingStatus: "계약완료", ownerStaff: "김영업" },
  { id: "lead_017", createdAtDaysAgo: 9, counselingStatus: "상담중", ownerStaff: "오세진" },
  { id: "lead_018", createdAtDaysAgo: 8, counselingStatus: "상담중", ownerStaff: "김영업" },
  { id: "lead_019", createdAtDaysAgo: 35, counselingStatus: "계약완료", ownerStaff: "오세진" },
  { id: "lead_020", createdAtDaysAgo: 16, counselingStatus: "취소", ownerStaff: "박지원" },
];

function buildLead(spec: SeedSpec): Lead {
  const createdAt = isoDaysAgo(spec.createdAtDaysAgo);
  const nowIso = new Date().toISOString();
  const id = spec.id;
  const s = spec.counselingStatus;
  const ownerStaff = spec.ownerStaff;
  const idNum = Number(id.replace("lead_", "")) || 0;

  const inPipeline = s === "계약완료";

  const base = makeBase({
    name: `고객${id.slice(-3)}`,
    phone: `010-90${id.slice(-3)}-${id.slice(-3)}${id.slice(-3).slice(0, 2)}`,
    desiredVehicle: idNum % 3 === 1 ? "쏘나타(견적)" : idNum % 3 === 2 ? "그랜저" : "K5",
    source:
      idNum % 4 === 1 ? "네이버" : idNum % 4 === 2 ? "상담톡" : idNum % 4 === 3 ? "전화" : "지인추천",
    leadTemperature: inPipeline ? "상" : s === "취소" ? "하" : "중",
    customerType: idNum === 14 || idNum === 15 ? "법인" : idNum === 10 ? "개인사업자" : "개인",
    wantedMonthlyPayment: 0,
    contractTerm: idNum === 14 ? "48개월" : "36개월",
    hasDepositOrPrepayment: s !== "취소",
    depositOrPrepaymentAmount: s !== "취소" ? "100만원" : "",
    ownerStaff,
    memo:
      s === "보류"
        ? "예산 확정 전. 1주 뒤 재확인"
        : s === "상담중" && idNum === 7
          ? "부재로 통화 실패. 문자/카톡 병행 예정"
          : "",
  });

  let nextContactAt: string | null = null;
  let nextContactMemo = "";
  if (s === "상담중" && (idNum === 5 || idNum === 17)) {
    nextContactAt = isoDaysFromNow(idNum === 5 ? 0 : 2);
    nextContactMemo = "필요 시 비교견적 재전달 및 진행 확인";
  }
  if (s === "상담중" && idNum === 4) {
    nextContactAt = isoDaysFromNow(3);
    nextContactMemo = "회신 유도(문자+카톡)";
  }
  if (s === "상담중" && idNum === 6) {
    nextContactAt = isoDaysFromNow(2);
    nextContactMemo = "회신 미도착 시 2일 후 재연락";
  }

  let contract: ContractInfo | null = null;
  if (inPipeline || idNum === 10) {
    contract = makeContract({
      product: idNum === 10 ? ("운용리스" as LeaseProduct) : ("금융리스" as LeaseProduct),
      vehicleName: idNum === 10 ? "그랜저 2.5" : "제네시스 GV70",
      vehiclePrice: 65_000_000,
      monthlyPayment: 480000,
      prepaymentSupportAmount: 500000,
      suppliesSupportContent: "썬팅, 블랙박스, 하이패스",
      suppliesSupportAmount: 300000,
      totalSupportCost: 800000,
      note: "법인 프로모션 반영",
      fee: 210000,
      profitMemo: "수익률 양호",
      contractDate: formatDateOnly(isoDaysAgo(20 - (spec.createdAtDaysAgo - 20))),
      customerCommitmentDate: formatDateOnly(isoDaysAgo(18 - (spec.createdAtDaysAgo - 20))),
      pickupPlannedAt: formatDateOnly(isoDaysFromNow(22)),
      depositAmount: 3_000_000,
      depositOrPrepayment: formatDepositDbLine(3_000_000, percentFromAmount(3_000_000, 65_000_000)),
      deliveryType: idNum === 19 ? "특판 출고" : "대리점 출고",
    });
  }

  let exportProgress: ExportProgress | null = null;
  let deliveredAt: string | null = null;

  if (inPipeline) {
    const delivered = idNum === 14 || idNum === 15 || idNum === 16;
    const stage: ExportStage = delivered
      ? "인도 완료"
      : idNum === 11
        ? "계약완료"
        : idNum === 12
          ? "발주 요청"
          : idNum === 13
            ? "전자약정 완료"
            : idNum === 19
              ? "인도 일정 조율"
              : "발주 완료";
    deliveredAt = delivered
      ? isoDaysAgo(idNum === 14 ? 10 : idNum === 15 ? 70 : 120)
      : null;
    exportProgress = makeExport(stage, deliveredAt, {
      orderDate: formatDateOnly(isoDaysAgo(delivered ? 30 : 14)),
      vehicleModel: delivered ? "GV70" : "그랜저 2.5",
      trim: delivered ? "AWD 프리미엄" : "프리미엄",
      options: "HUD, 드라이빙 어시스트",
      color: idNum === 19 ? "블랙" : "화이트",
      dealerName: "서울강남 대리점",
      dealerStaffName: "이딜러",
      financeCompany: delivered ? "현대캐피탈" : "KB캐피탈",
      vehicleContractNumber: `VC-${id.slice(-3)}-2026`,
      customerCommitmentDate: formatDateOnly(isoDaysAgo(delivered ? 20 : 7)),
      expectedDeliveryDate: formatDateOnly(isoDaysFromNow(delivered ? -8 : 12)),
      actualDeliveryDate: delivered
        ? formatDateOnly(isoDaysAgo(idNum === 14 ? 10 : idNum === 15 ? 70 : 120))
        : null,
      specialNote: delivered ? "인도 완료 처리" : "출고 일정 확정 대기",
      orderRequestedAt: isoDaysAgo(delivered ? 35 : 18),
      orderCompletedAt: isoDaysAgo(delivered ? 25 : 12),
      eContractStartedAt: isoDaysAgo(delivered ? 22 : 8),
      eContractCompletedAt: isoDaysAgo(delivered ? 18 : 5),
      deliveryCoordinatedAt: isoDaysAgo(delivered ? 12 : 2),
      transportCompanyReceivedAt: isoDaysAgo(delivered ? 9 : 1),
    });
  }

  const lastHandledAtDaysAgo =
    s === "신규"
      ? spec.createdAtDaysAgo
      : s === "보류"
        ? 10
        : s === "상담중" && idNum === 7
          ? 9
          : inPipeline && (idNum === 14 || idNum === 15 || idNum === 16)
            ? idNum === 14
              ? 12
              : idNum === 15
                ? 80
                : 140
            : 3;

  const lastHandledAt = isoDaysAgo(lastHandledAtDaysAgo);

  const records: CounselingRecord[] = [
    makeRecord({
      occurredAt: isoDaysAgo(spec.createdAtDaysAgo - 1),
      counselor: ownerStaff,
      method: "전화",
      content: "장기렌트/리스 기본 설명 및 조건 확인",
      reaction: idNum === 8 ? "관심 낮음" : "보통",
      desiredProgressAt: isoDaysFromNow(10),
      nextContactAt:
        s === "상담중" && (idNum === 5 || idNum === 17)
          ? nextContactAt ?? isoDaysFromNow(3)
          : isoDaysFromNow(5),
      nextContactMemo: nextContactMemo || "조건 재확인",
      importance: idNum === 5 || idNum === 17 ? "높음" : "보통",
    }),
  ];

  if (inPipeline || idNum === 10) {
    records.push(
      makeRecord({
        occurredAt: isoDaysAgo(2),
        counselor: ownerStaff,
        method: "카톡",
        content: "계약 조건 확정 및 서류 안내",
        reaction: "긍정",
        desiredProgressAt: isoDaysFromNow(15),
        nextContactAt: isoDaysFromNow(7),
        nextContactMemo: "전자약정 진행 체크",
        importance: "높음",
      })
    );
  }

  return {
    id,
    createdAt,
    updatedAt: nowIso,
    base,
    counselingStatus: s,
    statusUpdatedAt: lastHandledAt,
    nextContactAt,
    nextContactMemo: nextContactMemo || "",
    counselingRecords: records,
    contract,
    exportProgress,
    deliveredAt,
    lastHandledAt,
    ...defaultLeadOperationalFields(),
    ...(s === "취소"
      ? { failureReason: "단순 문의 후 이탈" as const }
      : s === "보류"
        ? { failureReason: "내부 의사결정 보류" as const }
        : {}),
    ...(inPipeline && idNum === 12
      ? { creditReviewStatus: "심사 접수" as const }
      : inPipeline && idNum === 13
        ? { creditReviewStatus: "심사 승인" as const }
        : {}),
  };
}

export const SEED_LEADS: Lead[] = SEED_SPECS.map(buildLead);

