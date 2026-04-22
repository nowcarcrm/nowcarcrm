import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Adjustment, DeliveryWithNames, MonthlyReportWithUser } from "@/app/(admin)/_types/settlement";
import { NotoSansKR_Base64 } from "./fonts/NotoSansKR-base64";

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function ensureKoreanFont(doc: jsPDF) {
  doc.addFileToVFS("NotoSansKR.ttf", NotoSansKR_Base64);
  doc.addFont("NotoSansKR.ttf", "NotoSansKR", "normal");
  doc.setFont("NotoSansKR", "normal");
}

export function generatePersonalReportPDF(
  report: MonthlyReportWithUser,
  deliveries: DeliveryWithNames[],
  adjustments: Adjustment[]
): ArrayBuffer {
  const doc = new jsPDF() as JsPdfWithTable;
  ensureKoreanFont(doc);

  doc.setFontSize(20);
  doc.text("정산서", 105, 20, { align: "center" });
  doc.setFontSize(11);
  doc.text(`${report.rate_month} 정산`, 105, 30, { align: "center" });

  doc.setFontSize(10);
  let y = 45;
  doc.text(`직원명: ${report.user_name}`, 20, y);
  doc.text(`소속: ${report.user_team_name ?? "-"} / ${report.user_rank}`, 110, y);
  y += 7;
  doc.text(`정산월: ${report.rate_month}`, 20, y);
  doc.text(`상태: ${formatStatus(report.status)}`, 110, y);

  y += 10;
  autoTable(doc, {
    startY: y,
    head: [["구분", "금액"]],
    body: [
      ["AG 수수료 합", formatWon(report.total_ag_commission)],
      ["대리점 수당 합", formatWon(report.total_dealer_commission)],
      ["기타 수익", formatWon(report.total_etc_revenue)],
      ["총 수익", formatWon(report.total_revenue)],
      ["고객 지원금 전체", formatWon(report.total_customer_support)],
      ["순 수익", formatWon(report.net_revenue)],
    ],
    styles: { font: "NotoSansKR", fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
  });

  const afterRevenue = (doc.lastAutoTable?.finalY ?? y) + 10;
  autoTable(doc, {
    startY: afterRevenue,
    head: [["항목", "값"]],
    body: [
      ["기본 요율", `${report.base_rate}%`],
      ["인센티브 (구간)", `${report.incentive_rate}% (${report.incentive_tier}구간)`],
      ["요율 수당", formatWon(report.rate_based_amount)],
      ["지원금 50% (부가세 포함)", formatWon(report.support_50_amount)],
      ["조정 항목", formatWon(report.adjustment_amount)],
      ["선지급 차감", formatWon(-(report.prepayment_amount ?? 0))],
    ],
    styles: { font: "NotoSansKR", fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
  });

  const finalY = (doc.lastAutoTable?.finalY ?? afterRevenue) + 15;
  doc.setFontSize(16);
  doc.text("최종 지급액 (세금계산서 발행)", 20, finalY);
  doc.setFontSize(20);
  doc.text(formatWon(report.final_amount), 190, finalY, { align: "right" });

  if (deliveries.length > 0) {
    doc.addPage();
    doc.setFont("NotoSansKR", "normal");
    doc.setFontSize(14);
    doc.text("반영된 출고 내역", 105, 20, { align: "center" });
    autoTable(doc, {
      startY: 30,
      head: [["인도일", "고객명", "차종", "차량가", "AG수수료", "대리점수당"]],
      body: deliveries.map((d) => [
        d.delivery_date,
        d.customer_name,
        d.car_model,
        formatWon(d.car_price),
        formatWon(d.ag_commission),
        d.dealer_commission ? formatWon(d.dealer_commission) : "-",
      ]),
      styles: { font: "NotoSansKR", fontSize: 9 },
    });
  }

  if (adjustments.length > 0) {
    const adjY = (doc.lastAutoTable?.finalY ?? 40) + 10;
    if (adjY > 240) {
      doc.addPage();
      doc.setFont("NotoSansKR", "normal");
      doc.setFontSize(12);
      doc.text("조정 항목", 20, 20);
      autoTable(doc, {
        startY: 25,
        head: [["일시", "금액", "사유"]],
        body: adjustments.map((a) => [new Date(a.created_at).toLocaleDateString("ko-KR"), formatWon(a.amount), a.reason]),
        styles: { font: "NotoSansKR", fontSize: 9 },
      });
    } else {
      doc.setFontSize(12);
      doc.text("조정 항목", 20, adjY);
      autoTable(doc, {
        startY: adjY + 5,
        head: [["일시", "금액", "사유"]],
        body: adjustments.map((a) => [new Date(a.created_at).toLocaleDateString("ko-KR"), formatWon(a.amount), a.reason]),
        styles: { font: "NotoSansKR", fontSize: 9 },
      });
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont("NotoSansKR", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`${i} / ${totalPages}  |  발행: ${new Date().toLocaleDateString("ko-KR")}  |  (주)나우카`, 105, 290, {
      align: "center",
    });
  }

  return doc.output("arraybuffer");
}

function formatWon(amount: number): string {
  return `${Math.round(Number(amount ?? 0)).toLocaleString("ko-KR")} 원`;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = { draft: "초안", confirmed: "확정", paid: "지급완료" };
  return map[status] ?? status;
}
