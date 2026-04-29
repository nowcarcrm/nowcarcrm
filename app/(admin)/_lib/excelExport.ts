import * as XLSX from "xlsx";
import { formatKst, kstYmd, todayYmdKst as todayYmdKstHelper } from "./kst";

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
  const formatted = formatKst(s, "datetime");
  return formatted || s.slice(0, 16);
}

export function formatDateOnlyForExcel(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "";
  const s = String(iso).trim();
  // 'YYYY-MM-DD' 또는 'YYYY-MM-DDT...' 형태의 순수 날짜 문자열은 TZ 변환 없이 그대로 (시각 미포함 날짜는 KST 변환 시 하루 밀릴 위험).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return kstYmd(s);
}

export function todayYmdKst(): string {
  return todayYmdKstHelper();
}

/** 엑셀 셀용 금액 문자열 (1,234,567원) */
export function formatWonForExcel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return `${Math.floor(n).toLocaleString("ko-KR")}원`;
}
