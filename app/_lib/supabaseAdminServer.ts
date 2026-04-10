import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.warn(
    "Supabase server env incomplete. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (admin API·diagnose)."
  );
}

let verifierClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getVerifierClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다.");
  }
  if (!verifierClient) {
    verifierClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return verifierClient;
}

function getAdminClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 없습니다. .env.local 에 서비스 롤 키를 넣어 주세요.");
  }
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  }
  return adminClient;
}

/** 첫 프로퍼티 접근 시에만 createClient — 빈 키로 모듈 로드가 깨지지 않게 함 */
export const supabaseAuthVerifier = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getVerifierClient();
    const v = Reflect.get(c, prop, receiver) as unknown;
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getAdminClient();
    const v = Reflect.get(c, prop, receiver) as unknown;
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
