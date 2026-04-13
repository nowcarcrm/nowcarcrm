/** PostgREST / @supabase 클라이언트 에러 객체를 사람이 읽을 수 있는 형태로 */

export function pickPostgrestFields(err: unknown): Record<string, unknown> {
  if (err == null || typeof err !== "object") {
    return { value: err };
  }
  const e = err as Record<string, unknown>;
  const status = (err as { status?: number }).status;
  return {
    message: e.message,
    code: e.code,
    details: e.details,
    hint: e.hint,
    ...(typeof status === "number" ? { status } : {}),
  };
}

export function formatPostgrestForMessage(err: unknown): string {
  const p = pickPostgrestFields(err);
  const msg = typeof p.message === "string" ? p.message : "";
  const details = typeof p.details === "string" ? p.details : "";
  const hint = typeof p.hint === "string" ? p.hint : "";
  const code = typeof p.code === "string" ? p.code : "";
  const parts = [msg, details, hint].filter((s) => s.length > 0);
  if (parts.length > 0) {
    const base = parts.join(" — ");
    return code ? `${base} (code=${code})` : base;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
