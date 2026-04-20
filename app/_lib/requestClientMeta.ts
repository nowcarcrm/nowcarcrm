/** API Route에서 클라이언트 IP·UA 추출 (프록시 헤더 우선) */

export function getClientIpFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = h.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return null;
}

export function getCfIpCountry(h: Headers): string | null {
  const c = h.get("cf-ipcountry")?.trim().toUpperCase();
  return c && c.length === 2 ? c : null;
}

export function classifyDeviceFromUserAgent(ua: string | null): string {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "unknown";
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/.test(s)) return "mobile";
  return "desktop";
}
