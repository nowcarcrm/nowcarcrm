/**
 * 출근 시각(ISO)을 Asia/Seoul 기준으로 해석해 지각 여부 판정.
 * 09:30:59까지 정상, 09:31:00부터 지각(분 단위; 09:30대 전체 유예).
 */
export function checkInIsLateBySeoul0931Rule(checkInIso: string): boolean {
  const d = new Date(checkInIso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  return hour > 9 || (hour === 9 && minute >= 31);
}
