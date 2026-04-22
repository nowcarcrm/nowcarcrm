import * as XLSX from "xlsx";
import type { DeliveryWithNames, MonthlyReportWithUser } from "@/app/(admin)/_types/settlement";

type AdjustmentRow = { amount: number; reason: string; created_at: string };

export function generatePersonalReportExcel(
  report: MonthlyReportWithUser,
  deliveries: DeliveryWithNames[],
  adjustments: AdjustmentRow[]
): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["정산서", ""],
    ["", ""],
    ["직원명", report.user_name],
    ["소속", report.user_team_name || "-"],
    ["직급", report.user_rank],
    ["정산월", report.rate_month],
    ["상태", formatStatus(report.status)],
    ["", ""],
    ["[수익 집계]", ""],
    ["AG 수수료 합", formatWon(report.total_ag_commission)],
    ["대리점 수당 합", formatWon(report.total_dealer_commission)],
    ["기타 수익", formatWon(report.total_etc_revenue)],
    ["총 수익", formatWon(report.total_revenue)],
    ["고객 지원금 합", formatWon(report.total_customer_support)],
    ["순 수익", formatWon(report.net_revenue)],
    ["", ""],
    ["[적용 요율]", ""],
    ["기본 요율", `${report.base_rate}%`],
    ["인센티브 대상", report.eligible_incentive ? "예" : "아니오"],
    ["인센티브 구간", `${report.incentive_tier}구간`],
    ["인센티브 요율", `${report.incentive_rate}%`],
    ["", ""],
    ["[지급액 계산]", ""],
    ["요율 수당", formatWon(report.rate_based_amount)],
    ["지원금 50% (부가세 포함)", formatWon(report.support_50_amount)],
    ["조정 항목", formatWon(report.adjustment_amount)],
    ["선지급 차감", formatWon(-(report.prepayment_amount ?? 0))],
    ["", ""],
    ["최종 지급액 (세금계산서 발행)", formatWon(report.final_amount)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 35 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws1, "정산서");

  const deliveryHeaders = ["인도일자", "고객명", "차종", "차량가", "AG수수료", "대리점수당", "고객지원금", "금융사", "출고방식", "상태"];
  const deliveryRows = deliveries.map((d) => [
    d.delivery_date,
    d.customer_name,
    d.car_model,
    formatWon(d.car_price),
    formatWon(d.ag_commission),
    formatWon(d.dealer_commission ?? 0),
    formatWon(d.customer_support),
    d.financial_company,
    d.delivery_type === "special" ? "특판" : "대리점",
    formatDeliveryStatus(d.status),
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([deliveryHeaders, ...deliveryRows]);
  ws2["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws2, "출고 내역");

  if (adjustments.length > 0) {
    const adjHeaders = ["일시", "금액", "사유"];
    const adjRows = adjustments.map((a) => [a.created_at, formatWon(a.amount), a.reason]);
    const ws3 = XLSX.utils.aoa_to_sheet([adjHeaders, ...adjRows]);
    ws3["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws3, "조정 항목");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function generateMonthlyOverviewExcel(reports: MonthlyReportWithUser[], month: string): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = [
    "팀",
    "직급",
    "이름",
    "AG수수료합",
    "대리점수당합",
    "기타수익",
    "총수익",
    "고객지원금",
    "순수익",
    "기본요율",
    "인센티브",
    "요율수당",
    "지원금50",
    "조정",
    "선지급차감",
    "최종지급액",
    "상태",
  ];
  const rows = reports.map((r) => [
    r.user_team_name || "-",
    r.user_rank,
    r.user_name,
    formatWon(r.total_ag_commission),
    formatWon(r.total_dealer_commission),
    formatWon(r.total_etc_revenue),
    formatWon(r.total_revenue),
    formatWon(r.total_customer_support),
    formatWon(r.net_revenue),
    `${r.base_rate}%`,
    `${r.incentive_rate}%`,
    formatWon(r.rate_based_amount),
    formatWon(r.support_50_amount),
    formatWon(r.adjustment_amount),
    formatWon(-(r.prepayment_amount ?? 0)),
    formatWon(r.final_amount),
    formatStatus(r.status),
  ]);
  const totals = [
    "",
    "",
    "합계",
    reports.reduce((s, r) => s + formatWon(r.total_ag_commission), 0),
    reports.reduce((s, r) => s + formatWon(r.total_dealer_commission), 0),
    reports.reduce((s, r) => s + formatWon(r.total_etc_revenue), 0),
    reports.reduce((s, r) => s + formatWon(r.total_revenue), 0),
    reports.reduce((s, r) => s + formatWon(r.total_customer_support), 0),
    reports.reduce((s, r) => s + formatWon(r.net_revenue), 0),
    "",
    "",
    reports.reduce((s, r) => s + formatWon(r.rate_based_amount), 0),
    reports.reduce((s, r) => s + formatWon(r.support_50_amount), 0),
    reports.reduce((s, r) => s + formatWon(r.adjustment_amount), 0),
    -reports.reduce((s, r) => s + formatWon(r.prepayment_amount ?? 0), 0),
    reports.reduce((s, r) => s + formatWon(r.final_amount), 0),
    "",
  ];
  const ws = XLSX.utils.aoa_to_sheet([[`${month} 월별 정산`], [], headers, ...rows, [], totals]);
  ws["!cols"] = headers.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws, "월별 정산");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function generateModilcaSubmissionExcel(deliveries: DeliveryWithNames[], month: string): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = ["인도일자", "담당자", "고객명", "차종", "차량가", "AG수수료", "금융사", "대리점명", "계약번호", "상품유형"];
  const rows = deliveries.map((d) => [
    d.delivery_date,
    d.owner_name,
    d.customer_name,
    d.car_model,
    formatWon(d.car_price),
    formatWon(d.ag_commission),
    d.financial_company,
    d.dealer_name || "-",
    d.dealer_contract_no || "-",
    d.product_type === "rent" ? "장기렌트" : "리스",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[`${month} 모딜카 제출`], [], headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 15 }));
  XLSX.utils.book_append_sheet(wb, ws, "모딜카 제출");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function formatWon(amount: number): number {
  return Math.round(Number(amount ?? 0));
}

function formatStatus(status: string): string {
  const map: Record<string, string> = { draft: "초안", confirmed: "확정", paid: "지급완료" };
  return map[status] || status;
}

function formatDeliveryStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "초안",
    pending_leader: "팀장대기",
    pending_director: "본부장대기",
    approved_director: "승인완료",
    modilca_submitted: "모딜카제출",
    confirmed: "확정",
    carried_over: "이월",
    finalized: "최종완료",
  };
  return map[status] || status;
}
