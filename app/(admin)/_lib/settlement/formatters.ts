import { formatKst } from "../kst";

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function formatNumberInput(value: number | string): string {
  const num = typeof value === "string" ? Number(value.replace(/,/g, "")) : value;
  if (Number.isNaN(num)) return "";
  return Math.round(num).toLocaleString("ko-KR");
}

export function parseNumberInput(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;
  return Math.round(num);
}

export function getSettlementMonth(date: string | Date): string {
  // 'YYYY-MM-DD' 순수 날짜 입력은 TZ 변환 없이 보존 (정산월 결정 안정성).
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return date.trim().slice(0, 7);
  }
  const ymd = formatKst(date, "date");
  if (!ymd) return "";
  return ymd.slice(0, 7);
}

export function getMonthRange(month: string) {
  const [year, m] = month.split("-").map(Number);
  const start = `${year}-${String(m).padStart(2, "0")}-01`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}
