export type HolidayConfigItem = {
  date: string; // yyyy-mm-dd
  name: string;
};

// 기본값: 운영 중 관리자가 Supabase holidays 테이블에서 추가/수정 가능
export const DEFAULT_HOLIDAYS: HolidayConfigItem[] = [
  { date: "2026-01-01", name: "신정" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },
];

