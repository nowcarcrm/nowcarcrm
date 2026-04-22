/** 한국 휴대폰 010-XXXX-XXXX 정규화·검증 */
export function digitsOnlyPhone(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function formatKoreanMobile(input: string): string {
  const d = digitsOnlyPhone(input);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

export function isValidKoreanMobile010(formatted: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(String(formatted ?? "").trim());
}

export const CONSULTATION_TIME_SLOT_VALUES = ["09-12", "12-15", "15-18"] as const;
export type ConsultationTimeSlotValue = (typeof CONSULTATION_TIME_SLOT_VALUES)[number];

export const CONSULTATION_TIME_SLOT_LABELS: Record<ConsultationTimeSlotValue, string> = {
  "09-12": "09시~12시",
  "12-15": "12시~15시",
  "15-18": "15시~18시",
};

export function consultationSlotMemoLine(slot: string | null | undefined): string | null {
  const s = String(slot ?? "").trim() as ConsultationTimeSlotValue;
  if (!s) return null;
  const label = CONSULTATION_TIME_SLOT_LABELS[s as ConsultationTimeSlotValue];
  if (!label) return null;
  return `[자동기록] 상담 시간대: ${label}`;
}
