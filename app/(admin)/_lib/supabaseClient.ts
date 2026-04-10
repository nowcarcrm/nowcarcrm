import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** 빈 문자열로 createClient 하면 SSG/빌드 단계에서 throw — CI·Vercel에서 env 누락 시에도 빌드가 끝나게 함 */
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder-build-only";
const resolvedUrl = supabaseUrl && supabaseAnonKey ? supabaseUrl : PLACEHOLDER_URL;
const resolvedKey = supabaseUrl && supabaseAnonKey ? supabaseAnonKey : PLACEHOLDER_ANON_KEY;
const expectedProjectRef = (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF ?? "").trim();
let didLogSupabaseUrl = false;

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

export function getSupabaseAuthTargetInfo() {
  const projectRef = projectRefFromUrl(supabaseUrl);
  return {
    url: supabaseUrl ?? "",
    projectRef,
    expectedProjectRef,
    projectRefMatch: expectedProjectRef ? expectedProjectRef === projectRef : null,
    anonKeyPreview: maskKey(supabaseAnonKey),
    authTokenEndpoint: supabaseUrl ? `${supabaseUrl}/auth/v1/token?grant_type=password` : "",
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

if (typeof window !== "undefined" && !didLogSupabaseUrl) {
  didLogSupabaseUrl = true;
  console.log("[Supabase URL]", supabaseUrl ?? "");
  console.log("[supabase-client] auth target", getSupabaseAuthTargetInfo());
}

/**
 * PKCE: 비밀번호 재설정 메일은 `?code=` 로 돌아옵니다. `/auth/callback`에서 exchangeCodeForSession 처리.
 * detectSessionInUrl: false — code/해시는 콜백·reset-password에서만 명시적으로 처리 (전역 Auth와 레이스 방지).
 */
export const supabase = createClient(resolvedUrl, resolvedKey, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

