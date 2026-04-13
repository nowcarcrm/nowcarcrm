/**
 * DB 컬럼 추가 없이 contracts.note 끝에 계약 확장 필드를 JSON으로 보관합니다.
 * 사용자 비고는 marker 앞 구간만 표시합니다.
 */

import type {
  ContractInfo,
  CounselingStatus,
  DeliveryTypeOption,
  LeaseProduct,
  QuoteHistoryEntry,
} from "./leaseCrmTypes";

export const CONTRACT_NOTE_MARKER = "\n\n[[CRM_CONTRACT_X1]]\n";

export type ContractExtraV1 = {
  v: 1;
  /** 차량가(원) */
  vp: number;
  /** 보증금/선납금 금액(원) */
  da: number;
  /** 보증금 차량가 대비 % (0~100) */
  dp: number;
  /** 수수료 차량가 대비 % (0~100) */
  fp: number;
  /** 출고 유형 */
  dt: DeliveryTypeOption;
};

export function clampPercent(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 100) / 100;
}

export function safeNonNegativeInt(n: unknown): number {
  const x = typeof n === "number" ? n : Number(String(n).replace(/,/g, "").trim());
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x);
}

/** 차량가 대비 퍼센트 → 금액(원, 반올림) */
export function amountFromPercent(vehiclePrice: number, percent: number): number {
  const vp = safeNonNegativeInt(vehiclePrice);
  const p = clampPercent(percent);
  if (vp <= 0 || p <= 0) return 0;
  return Math.round((vp * p) / 100);
}

/** 금액·차량가로부터 퍼센트 (소수 2자리) */
export function percentFromAmount(part: number, whole: number): number {
  const w = safeNonNegativeInt(whole);
  const a = safeNonNegativeInt(part);
  if (w <= 0 || a <= 0) return 0;
  return clampPercent((a / w) * 100);
}

/** 견적·계약 UI용: % → 금액 (인수 순서 percent 먼저) */
export function calculateAmountFromPercent(percent: number, vehiclePrice: number): number {
  return amountFromPercent(vehiclePrice, percent);
}

/** 견적·계약 UI용: 금액 → % */
export function calculatePercentFromAmount(amount: number, vehiclePrice: number): number {
  return percentFromAmount(amount, vehiclePrice);
}

export function formatWonInput(n: number): string {
  if (!n) return "";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

export function parseDigitsToInt(raw: string): number {
  const d = raw.replace(/[^\d]/g, "");
  if (!d) return 0;
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function parsePercentInput(raw: string): number {
  const t = raw.replace(/,/g, "").replace(/%/g, "").trim();
  if (!t) return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return clampPercent(n);
}

/** DB deposit_or_prepayment 컬럼용 한 줄 요약 */
export function formatDepositDbLine(amount: number, percent: number): string {
  const a = safeNonNegativeInt(amount);
  const p = clampPercent(percent);
  const amt = formatWonInput(a);
  if (a <= 0) return "";
  if (p > 0) return `${amt}원 (${p}%)`;
  return `${amt}원`;
}

/**
 * 견적 저장 직전: `depositAmount` / `prepaymentAmount` / `feeAmount`가
 * 퍼센트만 입력된 경우에도 차량가 기준으로 채워지도록 상호 보완합니다.
 */
export function normalizeQuoteMoneyForPersistence(
  vehiclePrice: number,
  input: {
    depositAmount: number;
    depositPercent: number;
    prepaymentAmount: number;
    prepaymentPercent: number;
    feeAmount: number;
    feePercent: number;
  }
) {
  const vp = safeNonNegativeInt(vehiclePrice);
  let depositAmount = safeNonNegativeInt(input.depositAmount);
  let depositPercent = clampPercent(input.depositPercent);
  let prepaymentAmount = safeNonNegativeInt(input.prepaymentAmount);
  let prepaymentPercent = clampPercent(input.prepaymentPercent);
  let feeAmount = safeNonNegativeInt(input.feeAmount);
  let feePercent = clampPercent(input.feePercent);
  if (vp > 0) {
    if (depositPercent > 0 && depositAmount === 0) {
      depositAmount = calculateAmountFromPercent(depositPercent, vp);
    } else if (depositAmount > 0 && depositPercent === 0) {
      depositPercent = calculatePercentFromAmount(depositAmount, vp);
    }
    if (prepaymentPercent > 0 && prepaymentAmount === 0) {
      prepaymentAmount = calculateAmountFromPercent(prepaymentPercent, vp);
    } else if (prepaymentAmount > 0 && prepaymentPercent === 0) {
      prepaymentPercent = calculatePercentFromAmount(prepaymentAmount, vp);
    }
    if (feePercent > 0 && feeAmount === 0) {
      feeAmount = calculateAmountFromPercent(feePercent, vp);
    } else if (feeAmount > 0 && feePercent === 0) {
      feePercent = calculatePercentFromAmount(feeAmount, vp);
    }
  }
  return {
    depositAmount,
    depositPercent,
    prepaymentAmount,
    prepaymentPercent,
    feeAmount,
    feePercent,
  };
}

/** 최신 견적 → 계약 탭 초기 반영용(차량가·보증금·선납·수수료·월납 등). */
export function contractPartialFromLatestQuote(q: QuoteHistoryEntry): Partial<ContractInfo> {
  const vp = safeNonNegativeInt(q.vehiclePrice);
  const m = normalizeQuoteMoneyForPersistence(vp, {
    depositAmount: q.depositAmount,
    depositPercent: q.depositPercent,
    prepaymentAmount: q.prepaymentAmount,
    prepaymentPercent: q.prepaymentPercent,
    feeAmount: q.feeAmount,
    feePercent: q.feePercent,
  });
  const depLine = formatDepositDbLine(m.depositAmount, m.depositPercent);
  const product: LeaseProduct = q.productType === "리스" ? "운용리스" : "장기렌트";
  const deliveryType: DeliveryTypeOption = q.deliveryType === "special" ? "특판 출고" : "대리점 출고";
  const partial: Partial<ContractInfo> = {
    vehiclePrice: vp,
    monthlyPayment: safeNonNegativeInt(q.monthlyPayment),
    contractTerm: q.contractTerm || "36개월",
    depositAmount: m.depositAmount,
    depositPercent: m.depositPercent,
    depositOrPrepayment: depLine,
    prepaymentSupportAmount: m.prepaymentAmount,
    fee: m.feeAmount,
    feePercent: m.feePercent,
    deliveryType,
    product,
  };
  const name = (q.vehicleModel ?? "").trim();
  if (name) partial.vehicleName = name;
  return partial;
}

export function splitContractNote(raw: string | null | undefined): {
  userNote: string;
  extra: ContractExtraV1 | null;
} {
  const s = raw ?? "";
  const i = s.indexOf(CONTRACT_NOTE_MARKER);
  if (i === -1) return { userNote: s.trimEnd(), extra: null };
  const userNote = s.slice(0, i).trimEnd();
  const jsonPart = s.slice(i + CONTRACT_NOTE_MARKER.length).trim();
  try {
    const p = JSON.parse(jsonPart) as ContractExtraV1;
    if (p && p.v === 1) return { userNote, extra: p };
  } catch {
    /* ignore */
  }
  return { userNote: s.trimEnd(), extra: null };
}

export function joinContractNote(userNote: string, extra: ContractExtraV1 | null): string {
  const u = (userNote ?? "").trimEnd();
  if (!extra) return u;
  const payload = JSON.stringify(extra);
  if (!u) return CONTRACT_NOTE_MARKER.trimStart() + "\n" + payload;
  return u + CONTRACT_NOTE_MARKER + payload;
}

/** note에 JSON을 붙일지 여부(빈 확장은 기존 note만 유지해 레거시와 동일하게 유지) */
export function shouldPersistContractExtra(e: ContractExtraV1): boolean {
  if (safeNonNegativeInt(e.vp) > 0) return true;
  if (safeNonNegativeInt(e.da) > 0) return true;
  if (clampPercent(e.dp) > 0) return true;
  if (clampPercent(e.fp) > 0) return true;
  return e.dt === "대리점 출고" || e.dt === "특판 출고";
}

/** deposit_or_prepayment 컬럼 레거시 한 줄에서 금액·% 추출 */
export function parseLegacyDepositLine(s: string): { amount: number; percent: number } {
  const str = (s ?? "").trim();
  if (!str) return { amount: 0, percent: 0 };
  let percent = 0;
  const pctMatch = str.match(/\(\s*([\d.]+)\s*%?\s*\)/);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (Number.isFinite(p) && p >= 0) percent = clampPercent(p);
  }
  const wonMatch = str.match(/([\d,]+)\s*원/);
  const amount = wonMatch ? parseDigitsToInt(wonMatch[1]) : parseDigitsToInt(str);
  return { amount: safeNonNegativeInt(amount), percent };
}

function coalesceDeliveryType(raw: unknown): DeliveryTypeOption {
  if (raw === "대리점 출고" || raw === "특판 출고") return raw;
  return "";
}

/** DB row + 파싱된 비고 → ContractInfo 확장 필드 채움 */
export function applyContractExtraToInfo(
  base: ContractInfo,
  extra: ContractExtraV1 | null
): ContractInfo {
  if (!extra) {
    return {
      ...base,
      vehiclePrice: base.vehiclePrice ?? 0,
      depositAmount: base.depositAmount ?? 0,
      depositPercent: base.depositPercent ?? 0,
      feePercent: base.feePercent ?? 0,
      deliveryType: base.deliveryType ?? "",
    };
  }
  return {
    ...base,
    vehiclePrice: safeNonNegativeInt(extra.vp),
    depositAmount: safeNonNegativeInt(extra.da),
    depositPercent: clampPercent(extra.dp),
    feePercent: clampPercent(extra.fp),
    deliveryType: coalesceDeliveryType(extra.dt),
  };
}

export function buildContractExtraFromInfo(c: ContractInfo): ContractExtraV1 {
  return {
    v: 1,
    vp: safeNonNegativeInt(c.vehiclePrice),
    da: safeNonNegativeInt(c.depositAmount),
    dp: clampPercent(c.depositPercent),
    fp: clampPercent(c.feePercent),
    dt: coalesceDeliveryType(c.deliveryType),
  };
}

/** 상담결과가 확정·출고일 때 계약 금액 스냅샷을 DB에 쓸 수 있음 */
export function shouldPersistContractAmountSnapshot(status: CounselingStatus): boolean {
  return status === "확정" || status === "출고" || status === "인도완료";
}

/** 차량가·보증금·수수료 스냅샷이 모두 잠김(이후 자동 덮어쓰기 금지) */
export function hasLockedMonetarySnapshot(c: ContractInfo): boolean {
  return (
    c.finalVehiclePrice != null &&
    Number.isFinite(c.finalVehiclePrice) &&
    c.finalDepositAmount != null &&
    Number.isFinite(c.finalDepositAmount) &&
    c.finalFeeAmount != null &&
    Number.isFinite(c.finalFeeAmount)
  );
}

export function hasFinalDeliverySnapshot(c: ContractInfo): boolean {
  const dt = c.finalDeliveryType;
  return dt === "대리점 출고" || dt === "특판 출고";
}

/** 금액·출고 유형 스냅샷이 모두 찬 상태 */
export function hasFullContractAmountSnapshot(c: ContractInfo): boolean {
  return hasLockedMonetarySnapshot(c) && hasFinalDeliverySnapshot(c);
}

/**
 * 확정/출고일 때만 스냅샷 갱신.
 * - 금액 스냅샷이 한 번 잠기면 vehicle/deposit/fee는 절대 덮어쓰지 않음.
 * - 출고 유형만 비어 있으면 이후 저장 시 live delivery로 보완 가능.
 */
export function applyContractSnapshotBeforeSave(
  c: ContractInfo,
  counselingStatus: CounselingStatus
): ContractInfo {
  if (!shouldPersistContractAmountSnapshot(counselingStatus)) {
    return c;
  }

  const liveDt =
    c.deliveryType === "대리점 출고" || c.deliveryType === "특판 출고" ? c.deliveryType : null;

  const monetaryLocked = hasLockedMonetarySnapshot(c);
  const deliveryLocked = hasFinalDeliverySnapshot(c);

  if (monetaryLocked && deliveryLocked) {
    return c;
  }

  if (monetaryLocked) {
    if (deliveryLocked) return c;
    if (liveDt) {
      return { ...c, finalDeliveryType: liveDt };
    }
    return c;
  }

  return {
    ...c,
    finalVehiclePrice: c.finalVehiclePrice ?? safeNonNegativeInt(c.vehiclePrice),
    finalDepositAmount: c.finalDepositAmount ?? safeNonNegativeInt(c.depositAmount),
    finalFeeAmount: c.finalFeeAmount ?? safeNonNegativeInt(c.fee),
    finalDeliveryType:
      c.finalDeliveryType === "대리점 출고" || c.finalDeliveryType === "특판 출고"
        ? c.finalDeliveryType
        : liveDt,
  };
}

/** 대시보드·집계: 스냅샷 수수료가 있으면 우선 */
export function effectiveContractFeeForMetrics(c: ContractInfo): number {
  if (c.finalFeeAmount != null && Number.isFinite(c.finalFeeAmount)) {
    return safeNonNegativeInt(c.finalFeeAmount);
  }
  return safeNonNegativeInt(c.fee);
}
