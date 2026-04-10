import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isPlaceholder(value: string | undefined) {
  if (!value) return true;
  return value.includes("YOUR-") || value.includes("YOUR_");
}

export function getSupabaseConfigStatus() {
  const missing = !supabaseUrl || !supabaseAnonKey;
  const placeholder =
    isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey);
  return {
    ok: !missing && !placeholder,
    missing,
    placeholder,
    url: supabaseUrl ?? "",
  };
}

function projectRefFromUrl(url: string | undefined) {
  if (!url) return "";
  try {
    const host = new URL(url).host;
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function maskKey(raw: string | undefined) {
  if (!raw) return "";
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`;
}

if (!getSupabaseConfigStatus().ok) {
  // Keep runtime explicit so misconfiguration is obvious.
  console.warn(
    "Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

if (typeof window !== "undefined") {
  const ref = projectRefFromUrl(supabaseUrl);
  console.log("[supabase-client] auth target", {
    url: supabaseUrl,
    projectRef: ref,
    anonKeyPreview: maskKey(supabaseAnonKey),
    authTokenEndpoint: supabaseUrl ? `${supabaseUrl}/auth/v1/token?grant_type=password` : "",
  });
}

/**
 * PKCE: 비밀번호 재설정 메일은 `?code=` 로 돌아옵니다. `/auth/callback`에서 exchangeCodeForSession 처리.
 * detectSessionInUrl: false — code/해시는 콜백·reset-password에서만 명시적으로 처리 (전역 Auth와 레이스 방지).
 */
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

