/**
 * 연락처 마스킹 (가운데 4자리 → ****)
 * - 본인 담당 / 팀장·팀원 담당 / 본부장 이상: 원본
 */
export function maskPhone(
  phone: string | null | undefined,
  opts: {
    isOwner: boolean;
    isTeamMemberLead: boolean;
    isDirectorOrAbove: boolean;
  }
): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  if (opts.isOwner || opts.isTeamMemberLead || opts.isDirectorOrAbove) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 11) {
    const a = digits.slice(0, 3);
    const b = digits.slice(7, 11);
    return `${a}-****-${b}`;
  }
  if (digits.length >= 10) {
    const a = digits.slice(0, 3);
    const b = digits.slice(6, 10);
    return `${a}-***-${b}`;
  }
  if (raw.length <= 4) return "****";
  return `${raw.slice(0, 2)}****${raw.slice(-2)}`;
}
