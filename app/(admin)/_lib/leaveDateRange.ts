/** YYYY-MM-DD 구간(시작·종료 포함)의 모든 날짜 키 */
export function eachDayInclusive(fromDate: string, toDate: string): string[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y1, m1, d1] = fromDate.split("-").map(Number);
  const [y2, m2, d2] = toDate.split("-").map(Number);
  const out: string[] = [];
  const cur = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** 달력 기준 시작~종료 포함 일수 */
export function countInclusiveCalendarDays(fromDate: string, toDate: string): number {
  return eachDayInclusive(fromDate, toDate).length;
}
