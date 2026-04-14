export type CustomerType = "개인" | "개인사업자" | "법인";

export type LeaseProduct = "장기렌트" | "운용리스" | "금융리스";

export type ContactMethod = "전화" | "문자" | "카톡" | "방문";

export type Importance = "높음" | "보통" | "낮음";
export type LeadTemperature = "상" | "중" | "하";

/** 업무 우선순위 (DB 컬럼 없음 · consultations `CRM_EXTRA` JSON으로 저장) */
export type LeadPriority = "긴급" | "일반" | "보류";

export const LEAD_PRIORITY_OPTIONS: LeadPriority[] = ["긴급", "일반", "보류"];

/** 취소·보류 시 필수 실패 사유 */
export const FAILURE_REASON_OPTIONS = [
  "월 납입금 부담",
  "심사 부결",
  "타업체 계약",
  "차량 대기기간 문제",
  "차종 변경",
  "내부 의사결정 보류",
  "단순 문의 후 이탈",
  "기타",
] as const;
export type FailureReasonOption = (typeof FAILURE_REASON_OPTIONS)[number];

/** 계약 진행 단계 고객용 심사 상태 */
export type CreditReviewStatus =
  | "심사 전"
  | "서류 요청 중"
  | "심사 접수"
  | "심사 승인"
  | "조건부 승인"
  | "심사 부결";

export const CREDIT_REVIEW_STATUS_OPTIONS: CreditReviewStatus[] = [
  "심사 전",
  "서류 요청 중",
  "심사 접수",
  "심사 승인",
  "조건부 승인",
  "심사 부결",
];

export type QuoteProductType = "렌트" | "리스";

/** 견적 출고 유형 */
export type QuoteDeliveryType = "agency" | "special";

export const QUOTE_DELIVERY_OPTIONS: { value: QuoteDeliveryType; label: string }[] = [
  { value: "agency", label: "대리점 출고" },
  { value: "special", label: "특판 출고" },
];

/** 고객별 견적 이력 (한 건) — CRM_EXTRA JSON. 금액 필드는 분석·정산·계약 이관용으로 항상 채우는 것을 권장합니다. */
export type QuoteHistoryEntry = {
  id: string;
  quotedAt: string; // yyyy-mm-dd
  productType: QuoteProductType;
  financeCompany: string;
  vehicleModel: string;
  /** 차량가(원) — % 계산 기준 */
  vehiclePrice: number;
  contractTerm: string;
  /** 보증금(원) — 저장 시 차량가·%와 함께 정규화 */
  depositAmount: number;
  depositPercent: number;
  /** 선납금(원) */
  prepaymentAmount: number;
  prepaymentPercent: number;
  /** 수수료(원) */
  feeAmount: number;
  feePercent: number;
  monthlyPayment: number;
  deliveryType: QuoteDeliveryType;
  maintenanceIncluded: boolean;
  note: string;
};

/**
 * 회사 공지 (public.notices)
 */
export type Notice = {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
  /** 상단 고정 (마이그레이션 20260413120000) */
  isPinned: boolean;
  /** 중요 공지 배지 */
  isImportant: boolean;
};

/** 상담결과(DB `status`와 동일). 진행단계(메뉴·파이프라인)와 별도입니다. */
export type CounselingStatus =
  | "신규"
  | "상담중"
  | "부재"
  | "계약완료"
  | "확정"
  | "출고"
  | "인도완료"
  | "보류"
  | "취소";

export const COUNSELING_STATUS_OPTIONS: CounselingStatus[] = [
  "신규",
  "상담중",
  "부재",
  "계약완료",
  "확정",
  "출고",
  "인도완료",
  "보류",
  "취소",
];

/** UI·드롭다운 공통 — 값은 DB `status`와 동일하게 `인도완료` 한글 붙여 쓰기 */
export const CONSULT_RESULT_OPTIONS: CounselingStatus[] = COUNSELING_STATUS_OPTIONS;

export function requiresFailureReasonStatus(status: CounselingStatus): boolean {
  return status === "보류" || status === "취소";
}

/** DB·로컬 레거시 문자열 → 상담결과 (이전에 쓰이던 진행단계형 문자열 포함) */
export function normalizeCounselingStatus(raw: string | null | undefined): CounselingStatus {
  const s = (raw ?? "").trim();
  if ((COUNSELING_STATUS_OPTIONS as readonly string[]).includes(s)) {
    return s as CounselingStatus;
  }
  if (s === "부재/연락안됨" || s === "부재") return "부재";
  if (s === "신규 디비") return "신규";
  if (s === "종료") return "취소";
  if (s === "인도완료" || s === "인도 완료") return "인도완료";
  if (
    s === "계약진행" ||
    s === "계약 진행" ||
    s === "출고진행" ||
    s === "출고 진행" ||
    s === "사후관리"
  ) {
    return "계약완료";
  }
  if (s === "재연락예정" || s === "재연락 예정") return "상담중";
  if (
    s === "1차 상담완료" ||
    s === "견적 발송" ||
    s === "회신 대기" ||
    s === "재상담 예정" ||
    s === "관심낮음" ||
    s === "계약진행중" ||
    s === "출고진행중"
  ) {
    return "상담중";
  }
  return "신규";
}

// 출고 진행 상태(요구사항 #5)
export type ExportStage =
  | "계약완료"
  | "발주 요청"
  | "발주 완료"
  | "전자약정 전"
  | "전자약정 완료"
  | "출문 요청"
  | "탁송사 전달"
  | "탁송사 입고"
  | "인도 일정 조율"
  | "인도 완료";

/** 고객 추가·필터용 유입 경로(자유 입력 레거시는 그대로 문자열로 유지) */
export const LEAD_SOURCE_OPTIONS = [
  "네이버",
  "메타",
  "틱톡",
  "유튜브",
  "대표전화",
  "플러스친구",
] as const;
export type LeadSourcePreset = (typeof LEAD_SOURCE_OPTIONS)[number];

export const BASE_CONTRACT_TERM_OPTIONS = ["12개월", "24개월", "36개월", "48개월", "60개월"] as const;

export type CustomerBase = {
  name: string;
  phone: string;
  desiredVehicle: string; // 원하는 차종
  source: string; // 유입 경로
  leadTemperature: LeadTemperature; // 고객 온도(상·중·하)
  customerType: CustomerType;
  /** 레거시·호환용(폼에서는 미사용, 0 허용) */
  wantedMonthlyPayment: number;
  contractTerm: string; // 계약기간(예: 36개월)
  /** 레거시·호환용; UI는 금액 입력칸과 동기화 */
  hasDepositOrPrepayment: boolean;
  /** 보증금/선납금 금액(직접 입력) */
  depositOrPrepaymentAmount: string;
  ownerStaff: string; // 담당 직원
  memo: string;
};

/** 계약 출고 유형(DB 전용 컬럼 없음 · note 확장 JSON에 함께 저장) */
export type DeliveryTypeOption = "" | "대리점 출고" | "특판 출고";

export const DELIVERY_TYPE_OPTIONS: Array<Exclude<DeliveryTypeOption, "">> = [
  "대리점 출고",
  "특판 출고",
];

export type ContractInfo = {
  contractDate: string; // ISO(yyyy-mm-dd)
  customerCommitmentDate: string; // 고객 약정일
  product: LeaseProduct;
  vehicleName: string; // 계약 차량명
  /** 차량가(원) — 보증금·수수료 % 계산 기준 */
  vehiclePrice: number;
  monthlyPayment: number;
  contractTerm: string; // 계약기간
  /** 보증금/선납금 금액(원) — DB 문자열과 동기화 */
  depositAmount: number;
  /** 차량가 대비 % (0이면 미사용·레거시만 문자) */
  depositPercent: number;
  depositOrPrepayment: string; // DB 요약 문자열(저장 시 자동 생성)
  /** 선납금 지원금액(원) — DB 컬럼 `customer_support_amount` */
  prepaymentSupportAmount: number;
  suppliesSupportContent: string; // 용품지원 내용
  suppliesSupportAmount: number; // 용품지원 금액
  totalSupportCost: number; // 총 지원 비용
  note: string; // 비고(사용자 입력; 시스템 JSON은 별도 marker)
  fee: number; // 수수료(원)
  /** 차량가 대비 수수료 % */
  feePercent: number;
  /** 대리점 출고일 때만 반영되는 추가 수익 */
  dealerAllowance: number;
  profitMemo: string; // 수익 메모
  pickupPlannedAt: string; // 출고 예정일
  deliveryType: DeliveryTypeOption;
  /** 계산 필드(표시용) */
  netProfit?: number;
  /** 확정·출고 시점 스냅샷(첫 저장 후 고정, 견적 변경과 무관한 실적·수수료 기준) */
  finalVehiclePrice?: number | null;
  finalDepositAmount?: number | null;
  finalFeeAmount?: number | null;
  finalDeliveryType?: DeliveryTypeOption | null;
};

export type ExportProgress = {
  stage: ExportStage;
  orderDate?: string; // 발주일
  vehicleModel?: string; // 차종
  trim?: string; // 등급/트림
  options?: string; // 옵션
  color?: string; // 색상
  dealerName?: string; // 대리점명
  dealerStaffName?: string; // 담당 딜러명
  financeCompany?: string; // 진행 금융사
  vehicleContractNumber?: string; // 차량 계약번호
  customerCommitmentDate?: string; // 고객 약정일
  expectedDeliveryDate?: string; // 인도 예정일
  actualDeliveryDate?: string | null; // 실제 인도일
  specialNote?: string; // 특이사항 메모
  orderRequestedAt?: string;
  orderCompletedAt?: string;
  eContractStartedAt?: string;
  eContractCompletedAt?: string;
  deliveryCoordinatedAt?: string;
  deliveredAt?: string | null; // 인도 완료일
  transportCompanyReceivedAt?: string; // 탁송사 입고
};

export type CounselingRecord = {
  id: string;
  occurredAt: string; // 상담일시(ISO)
  counselor: string; // 상담 담당자
  method: ContactMethod; // 상담 방식
  content: string; // 상담 내용
  reaction: string; // 고객 반응
  desiredProgressAt: string; // 희망 진행 시점
  nextContactAt: string; // 다음 연락 예정일
  nextContactMemo: string; // 다음 연락 메모
  importance: Importance; // 중요도
};

export type Lead = {
  id: string;
  managerUserId?: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO (마지막 처리 기준)

  base: CustomerBase;

  counselingStatus: CounselingStatus; // 상담결과 (DB `leads.status`; 사이드바 진행단계와 별개)
  statusUpdatedAt: string; // ISO

  // 자동 관리/분류에 필요한 필드
  nextContactAt: string | null; // 다음 연락 예정일
  nextContactMemo: string;

  // 상담 기록
  counselingRecords: CounselingRecord[];

  // 계약/출고
  contract: ContractInfo | null;
  exportProgress: ExportProgress | null;

  // 인도 완료 후 사후관리 계산용
  deliveredAt: string | null; // 인도 완료일

  // 화면에서 쓰기 좋은 "마지막 처리일"
  lastHandledAt: string; // ISO

  /** AI 상담 어시스트 요약(옵션 · leads 컬럼) */
  summaryText?: string;
  /** AI 다음 행동 추천(옵션 · leads 컬럼) */
  nextAction?: string;
  /** AI 고객 의도 태그(옵션 · leads 컬럼) */
  customerIntent?: "exploring" | "interested" | "closing" | "";

  /** 우선순위 · DB 없음 · CRM_EXTRA */
  leadPriority: LeadPriority;
  /** 취소/보류 시 필수(저장 시 검증) */
  failureReason: string;
  /** 실패 사유가 "기타"일 때 보조 메모 */
  failureReasonNote: string;
  /** 계약 진행 고객 심사 상태 · CRM_EXTRA */
  creditReviewStatus: CreditReviewStatus;
  /** 견적 이력 · CRM_EXTRA */
  quoteHistory: QuoteHistoryEntry[];
};

export function defaultLeadOperationalFields(): Pick<
  Lead,
  "leadPriority" | "failureReason" | "failureReasonNote" | "creditReviewStatus" | "quoteHistory"
> {
  return {
    leadPriority: "일반",
    failureReason: "",
    failureReasonNote: "",
    creditReviewStatus: "심사 전",
    quoteHistory: [],
  };
}

export type LeadCategoryKey =
  | "new-db"
  | "counseling-progress"
  | "follow-up"
  | "unresponsive"
  | "quote-sent"
  | "contract-progress"
  | "export-progress"
  | "delivery-complete"
  | "aftercare"
  | "hold"
  | "cancel";

