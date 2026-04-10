import { EMPLOYEES } from "./leaseCrmSeed";
import { supabase } from "./supabaseClient";

export type UserRole = "admin" | "manager" | "staff";

export type UserApprovalStatus = "pending" | "approved" | "rejected";

/**
 * public.users — 권장 스키마: id = auth.users.id (동일 UUID)
 * 레거시: 별도 id + auth_user_id 로 auth 연결
 */
export type UserRow = {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
  /** 마이그레이션 전 행은 UI에서 approved 로 간주 */
  approval_status?: UserApprovalStatus | null;
  /** 레거시 스키마용(신규는 생략 가능) */
  auth_user_id?: string | null;
  /** 조회·직원 목록용(선택 컬럼) */
  email?: string | null;
};

/** 컬럼 없음·null 은 기존 직원으로 간주해 승인된 것으로 처리 */
export function effectiveApprovalStatus(row: Pick<UserRow, "approval_status">): UserApprovalStatus {
  const s = row.approval_status;
  if (s === "pending" || s === "rejected" || s === "approved") return s;
  return "approved";
}

export function roleLabelKo(role: UserRole): string {
  if (role === "admin") return "관리자";
  if (role === "manager") return "매니저";
  return "직원";
}

/** 세션 auth.users.id 로 CRM 프로필 조회 (신규: users.id = auth id / 레거시: auth_user_id) */
export async function getUserProfileByAuthId(authUserId: string): Promise<UserRow | null> {
  console.log("[users] query by id condition:", {
    table: "users",
    where: { id: authUserId },
  });
  const { data: byPk, error: errPk } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUserId)
    .maybeSingle();
  console.log("[auth] profile query users.id = auth.uid:", { authUserId, data: byPk, error: errPk });
  if (errPk) {
    console.error("[users] query by id raw error:", errPk);
    throw new Error(`[PROFILE_BY_ID] ${errPk.message ?? "users 조회 실패"}`);
  }
  if (byPk) return byPk as UserRow;

  console.log("[users] query by legacy auth_user_id condition:", {
    table: "users",
    where: { auth_user_id: authUserId },
  });
  const { data: legacy, error: errLegacy } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  console.log("[auth] profile query users.auth_user_id:", { authUserId, data: legacy, error: errLegacy });
  if (errLegacy) {
    console.error("[users] query by auth_user_id raw error:", errLegacy);
    throw new Error(`[PROFILE_BY_AUTH_USER_ID] ${errLegacy.message ?? "users 조회 실패"}`);
  }
  return (legacy as UserRow | null) ?? null;
}

export async function ensureDefaultUsers() {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const payload = EMPLOYEES.map((name, idx) => ({
    name,
    email: `${name.replace(/\s+/g, "").toLowerCase()}@company.local`,
    role: idx === 0 ? "admin" : idx === 1 ? "manager" : "staff",
    approval_status: "approved" as const,
  }));

  const { error: insertError } = await supabase.from("users").insert(payload);
  if (insertError) throw insertError;
}

export async function listActiveUsers(): Promise<UserRow[]> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .or("approval_status.eq.approved,approval_status.is.null")
      .order("name", { ascending: true });
    console.log("users fetch result:", data, error);
    if (error) {
      console.warn("[listActiveUsers] 비어 있는 목록으로 대체:", error.message);
      return [];
    }
    const rows = (data as UserRow[]) ?? [];
    return rows.filter((u) => effectiveApprovalStatus(u) === "approved");
  } catch (e) {
    console.warn("[listActiveUsers] 예외, 빈 배열 반환:", e);
    return [];
  }
}

/** @deprecated 이름 호환 — getUserProfileByAuthId 사용 */
export async function getActiveUserByAuthId(authUserId: string) {
  return getUserProfileByAuthId(authUserId);
}

export async function getActiveUserByEmail(email: string) {
  console.log("[users] query by email condition:", {
    table: "users",
    where: { email },
  });
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.error("[users] query by email raw error:", error);
    throw new Error(`[PROFILE_BY_EMAIL] ${error.message ?? "users 조회 실패"}`);
  }
  return (data as UserRow | null) ?? null;
}

/** 활성/비활성 무관 조회: 로그인 오류 원인 분기용 */
export async function getUserByAuthIdAny(authUserId: string): Promise<UserRow | null> {
  const { data: byPk, error: errPk } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUserId)
    .maybeSingle();
  if (errPk) throw errPk;
  if (byPk) return byPk as UserRow;

  const { data: legacy, error: errLegacy } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (errLegacy) throw errLegacy;
  return (legacy as UserRow | null) ?? null;
}

/** 활성/비활성 무관 조회: 로그인 오류 원인 분기용 */
export async function getUserByEmailAny(email: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return (data as UserRow | null) ?? null;
}

/** 레거시: auth 연결만 갱신 */
export async function updateUserAuthLink(userId: string, authUserId: string) {
  const { data, error } = await supabase
    .from("users")
    .update({ auth_user_id: authUserId })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as UserRow;
}

/** 공개 회원가입 직후 트리거가 users 행을 만들지 않은 경우 보조 삽입 */
export async function createPendingStaffProfileFromAuth(input: {
  authUserId: string;
  email: string;
  name: string;
}) {
  const base = input.name.trim() || input.email.split("@")[0] || "staff";
  const uniqueName = `${base} · ${input.authUserId.replace(/-/g, "").slice(0, 8)}`;
  const payload = {
    id: input.authUserId,
    auth_user_id: input.authUserId,
    email: input.email,
    name: uniqueName,
    role: "staff" as UserRole,
    approval_status: "pending" as const,
  };
  const { data, error } = await supabase.from("users").insert(payload).select("*").single();
  if (error) throw error;
  return data as UserRow;
}

export async function createActiveUserFromAuth(input: {
  authUserId: string;
  email: string;
  name: string;
}) {
  const payload = {
    id: input.authUserId,
    auth_user_id: input.authUserId,
    email: input.email,
    name: input.name,
    role: "staff" as UserRole,
    approval_status: "approved" as const,
  };
  const { data, error } = await supabase.from("users").insert(payload).select("*").single();
  if (error) throw error;
  return data as UserRow;
}
