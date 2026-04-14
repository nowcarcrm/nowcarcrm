"use client";

import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import {
  effectiveApprovalStatus,
  getActiveUserByEmail,
  getUserProfileByAuthId,
  updateUserAuthLink,
  type UserApprovalStatus,
  type UserRow,
} from "./usersSupabase";
import {
  effectiveRole,
  effectiveRank,
  isSuperAdminEmail,
  type UserRole,
} from "./rolePermissions";

const AUTH_DEBUG_VERSION = "auth-diagnose-2026-04-10-v1";

export type AuthProfile = {
  authUserId: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  rank: string | null;
  teamName: string | null;
  divisionName: string | null;
  /** users.is_active — false면 CRM 접근 불가 */
  isActive: boolean;
  approvalStatus: UserApprovalStatus;
  /** approval_status === 'approved' (레거시 null은 effective에서 pending) */
  approved: boolean;
};

/** 비밀번호 재설정·PKCE 콜백: CRM 프로필 해결 시 승인 검사/연결 실패로 signOut 되면 recovery 세션이 끊깁니다. */
const PATHS_SKIP_CRM_PROFILE = new Set(["/reset-password", "/auth/callback"]);

function shouldSkipCrmProfileResolution(): boolean {
  if (typeof window === "undefined") return false;
  return PATHS_SKIP_CRM_PROFILE.has(window.location.pathname);
}

function normalizeName(user: User) {
  const fromMeta = user.user_metadata?.name;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  if (user.email) return user.email.split("@")[0];
  return "staff";
}

function rowIsActive(row: UserRow): boolean {
  return row.is_active !== false;
}

function toAuthProfile(user: User, row: UserRow): AuthProfile {
  const fallbackName = normalizeName(user);
  const approvalStatus = effectiveApprovalStatus(row);
  const role = effectiveRole({ email: user.email ?? row.email ?? "", role: row.role });
  const rank = effectiveRank({ email: user.email ?? row.email ?? "", role: row.role, rank: row.rank });
  return {
    authUserId: user.id,
    userId: row.id,
    email: user.email ?? row.email ?? "",
    name: row.name?.trim() || row.email?.split("@")[0] || fallbackName,
    role,
    rank,
    teamName: row.team_name ?? null,
    divisionName: row.division_name ?? null,
    isActive: rowIsActive(row),
    approvalStatus,
    approved: approvalStatus === "approved",
  };
}

function isSessionMissingAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; name?: string };
  const msg = (e.message ?? "").toLowerCase();
  return (
    e.name === "AuthSessionMissingError" ||
    (msg.includes("session") && msg.includes("missing"))
  );
}

async function assertStaffAccountUsable(row: UserRow) {
  const status = effectiveApprovalStatus(row);
  if (status === "rejected") {
    await supabase.auth.signOut();
    throw new Error("승인 거절된 계정입니다. 관리자에게 문의하세요.");
  }
}

async function enforceSuperAdminIdentity(user: User, row: UserRow): Promise<UserRow> {
  if (!isSuperAdminEmail(user.email)) return row;
  const patch: Partial<UserRow> = {};
  if (row.role !== "super_admin") patch.role = "super_admin";
  if (Object.keys(patch).length === 0) return row;
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) {
    // Fail-safe: 보정 실패로 로그인 자체를 막지 않음
    console.warn("[auth] super admin identity patch skipped:", error.message);
    return row;
  }
  return (data as UserRow) ?? row;
}

export async function signInWithEmail(email: string, password: string) {
  console.log("[login] signInWithPassword start", { email: email.trim().toLowerCase() });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  console.log("[login] signInWithPassword raw result", { data, error });
  if (error) {
    const e = error as { message?: string; status?: number; code?: string; name?: string };
    console.error("[login] signInWithPassword raw error", {
      name: e.name,
      message: e.message,
      status: e.status,
      code: e.code,
      full: error,
    });
  }
  console.log("[login] signInWithPassword result — error:", error, "data:", {
    user: data?.user?.id,
    email: data?.user?.email,
    hasSession: !!data?.session,
    sessionExpiresAt: data?.session?.expires_at,
  });
  if (error) throw error;
  return data;
}

/**
 * 로그인 폼용: signIn 응답의 user로 바로 CRM 프로필을 해결합니다.
 * 직후 `getUser()`를 호출하지 않아 "Auth session missing" 레이스를 피합니다.
 */
export async function signInWithEmailAndResolveProfile(
  email: string,
  password: string
): Promise<AuthProfile> {
  console.log("[login] signInWithEmailAndResolveProfile start");
  const data = await signInWithEmail(email, password);
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  console.log("[login] post-signIn getSession:", {
    hasSession: !!sessionData.session,
    userId: sessionData.session?.user?.id,
    sessionErr,
  });
  const {
    data: { user: fetchedUser },
    error: userErr,
  } = await supabase.auth.getUser();
  console.log("[login] post-signIn getUser:", { userId: fetchedUser?.id, userErr });
  if (!data?.user) {
    throw new Error(
      "세션 생성 실패: 로그인 응답에 사용자 정보가 없습니다. 네트워크·Supabase 설정을 확인해 주세요."
    );
  }
  if (!data.session) {
    console.warn("[login] signIn succeeded but session is null (often email not confirmed)");
    await supabase.auth.signOut().catch(() => {});
    throw new Error(
      "세션 생성 실패: 세션이 발급되지 않았습니다. 이메일 인증(확인 링크)을 완료했는지 확인하거나, Supabase에서 이메일 확인 요구를 끈 뒤 다시 시도해 주세요."
    );
  }
  console.log("[login] session present, resolving CRM profile for user:", data.user.id);
  return resolveAuthProfile(data.user);
}

export async function signOutAuth() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resolveAuthProfile(user: User): Promise<AuthProfile> {
  console.log("[auth] resolveAuthProfile start:", user.id, user.email);
  let linked: UserRow | null = null;
  try {
    linked = await getUserProfileByAuthId(user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[RESOLVE_PROFILE] ${msg}`);
  }
  console.log("[auth] profile lookup by auth id:", user.id, "→", linked ? "found" : "not found", linked);

  if (linked) {
    if (!rowIsActive(linked)) {
      await supabase.auth.signOut();
      throw new Error("사용 중지된 계정입니다. 관리자에게 문의하세요.");
    }
    linked = await enforceSuperAdminIdentity(user, linked);
    const linkedRole = effectiveRole({ email: user.email ?? linked.email ?? "", role: linked.role });
    if (linkedRole !== "super_admin" && linkedRole !== "admin" && linkedRole !== "staff") {
      await supabase.auth.signOut();
      throw new Error("허용되지 않은 계정 권한입니다. 관리자에게 문의하세요.");
    }
    if (linkedRole === "staff") {
      await assertStaffAccountUsable(linked);
    }
    return toAuthProfile(user, linked);
  }

  const email = user.email ?? "";
  if (!email) {
    throw new Error("CRM 프로필 없음: 로그인 계정 이메일을 확인할 수 없어 CRM 프로필과 연결할 수 없습니다.");
  }

  let byEmail: UserRow | null = null;
  try {
    byEmail = await getActiveUserByEmail(email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[RESOLVE_PROFILE_EMAIL] ${msg}`);
  }
  console.log("[auth] profile lookup by email:", email, "→", byEmail ? "found" : "not found", byEmail);

  if (byEmail) {
    const linkedByEmail = await enforceSuperAdminIdentity(user, byEmail);
    const updated = (await updateUserAuthLink(linkedByEmail.id, user.id)) as UserRow;
    if (!rowIsActive(updated)) {
      await supabase.auth.signOut();
      throw new Error("사용 중지된 계정입니다. 관리자에게 문의하세요.");
    }
    const updatedRole = effectiveRole({ email: user.email ?? updated.email ?? "", role: updated.role });
    if (updatedRole !== "super_admin" && updatedRole !== "admin" && updatedRole !== "staff") {
      await supabase.auth.signOut();
      throw new Error("허용되지 않은 계정 권한입니다. 관리자에게 문의하세요.");
    }
    if (updatedRole === "staff") {
      await assertStaffAccountUsable(updated);
    }
    return toAuthProfile(user, updated);
  }
  await supabase.auth.signOut();
  throw new Error("직원 계정 정보가 없습니다. 관리자에게 문의하세요.");
}

/**
 * 앱 초기화·새로고침용. 세션이 있으면 `getSession()`의 user를 우선 사용해
 * signIn 직후 레이스와 일부 환경에서의 "Auth session missing"을 줄입니다.
 */
export async function getCurrentAuthProfile() {
  console.log("[auth] getCurrentAuthProfile start", { AUTH_DEBUG_VERSION });
  if (shouldSkipCrmProfileResolution()) {
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`[GET_SESSION] ${sessionError.message ?? "세션 조회 실패"}`);
  }
  console.log("[auth] getSession:", {
    hasSession: !!session,
    userId: session?.user?.id,
    sessionError,
  });

  let user: User | null = session?.user ?? null;

  if (!user) {
    const {
      data: { user: fetched },
      error: userError,
    } = await supabase.auth.getUser();
    console.log("[auth] getUser (no session):", { user: fetched?.id, userError });
    if (userError) {
      if (isSessionMissingAuthError(userError)) {
        return null;
      }
      throw new Error(`[GET_USER] ${userError.message ?? "사용자 조회 실패"}`);
    }
    user = fetched;
  }

  if (!user) {
    return null;
  }

  console.log("userId:", user.id);
  return resolveAuthProfile(user);
}
