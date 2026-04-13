import * as XLSX from "xlsx";

function sanitizeFilenameBase(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "export";
}

/** 한글·날짜 포함 xlsx 다운로드 (브라우저) */
export function downloadXlsxRows(
  rows: Record<string, string | number | null | undefined>[],
  sheetName: string,
  filenameBase: string
): void {
  if (rows.length === 0) {
    rows = [{ 안내: "보낼 데이터가 없습니다." }];
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  const safeSheet = sheetName.slice(0, 31).replace(/[:\\/?*[\]]/g, "_") || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  const fname = `${sanitizeFilenameBase(filenameBase)}.xlsx`;
  XLSX.writeFile(wb, fname);
}

export function formatDateForExcel(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "";
  const s = String(iso).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function formatDateOnlyForExcel(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "";
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmdKst(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 엑셀 셀용 금액 문자열 (1,234,567원) */
export function formatWonForExcel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return `${Math.floor(n).toLocaleString("ko-KR")}원`;
}
