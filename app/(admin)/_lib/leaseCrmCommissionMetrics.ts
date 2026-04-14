import { effectiveContractNetProfitForMetrics } from "./leaseCrmContractPersist";
import type { Lead } from "./leaseCrmTypes";

/** 수수료·금액 필드 안전 파싱 (NaN·빈 문자열 → 0) */
export function toSafeMoney(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * 리드 1건의 "예상 수수료" 후보 금액(원).
 * - 계약 탭에 값이 있으면 스냅샷 수수료 우선(effectiveContractFeeForMetrics)
 * - 없으면 견적 이력 최신 건의 feeAmount (DB CRM_EXTRA에 저장되어 재조회 시에도 유지)
 */
export function expectedFeeWonForLead(lead: Lead): number {
  if (lead.contract) {
    return effectiveContractNetProfitForMetrics(lead.contract);
  }
  const quotes = Array.isArray(lead.quoteHistory) ? lead.quoteHistory : [];
  if (quotes.length === 0) return 0;
  const sorted = [...quotes].sort((a, b) => (a.quotedAt < b.quotedAt ? 1 : -1));
  const latest = sorted[0];
  return toSafeMoney(latest?.feeAmount);
}

/**
 * 대시보드「예상 수수료」: 취소 고객 제외, 보류·진행 전 단계 포함.
 * 로드된 leads 배열이 이미 본인 담당 필터라면 그 범위 안에서만 합산.
 */
export function calculateExpectedCommission(leads: Lead[]): number {
  let sum = 0;
  for (const l of leads) {
    if (l.counselingStatus === "취소") continue;
    sum += expectedFeeWonForLead(l);
  }
  return sum;
}
