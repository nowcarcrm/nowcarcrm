"use client";

import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import {
  createActiveUserFromAuth,
  effectiveApprovalStatus,
  getActiveUserByEmail,
  getUserByAuthIdAny,
  getUserByEmailAny,
  getUserProfileByAuthId,
  updateUserAuthLink,
  type UserRole,
  type UserRow,
} from "./usersSupabase";

export type AuthProfile = {
  authUserId: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
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

function toAuthProfile(user: User, row: UserRow): AuthProfile {
  return {
    authUserId: user.id,
    userId: row.id,
    email: user.email ?? row.email ?? "",
    name: row.name,
    role: row.role,
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

async function assertUserApproved(row: UserRow) {
  const raw = row.approval_status;
  const status = effectiveApprovalStatus(row);
  console.log("[auth] approval_status raw:", raw, "effective:", status, "user row id:", row.id);
  if (status === "approved") return;

  await supabase.auth.signOut();
  if (status === "rejected") {
    throw new Error(
      "가입 승인이 거절되었습니다. (approval_status: rejected) 관리자에게 문의하세요."
    );
  }
  if (status === "pending") {
    throw new Error(
      "관리자 승인 대기 중입니다. (approval_status: pending) 승인 후 다시 로그인해 주세요."
    );
  }
  throw new Error(`계정을 사용할 수 없습니다. (승인 상태: ${String(raw ?? "알 수 없음")})`);
}

export async function signInWithEmail(email: string, password: string) {
  console.log("[login] signInWithPassword start", { email: email.trim().toLowerCase() });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
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
  const linked = await getUserProfileByAuthId(user.id);
  console.log("[auth] profile lookup by auth id:", user.id, "→", linked ? "found" : "not found", linked);

  if (linked) {
    await assertUserApproved(linked);
    return toAuthProfile(user, linked);
  }

  const email = user.email ?? "";
  if (!email) {
    throw new Error("CRM 프로필 없음: 로그인 계정 이메일을 확인할 수 없어 CRM 프로필과 연결할 수 없습니다.");
  }

  const linkedAny = await getUserByAuthIdAny(user.id);
  if (linkedAny && !linkedAny.is_active) {
    await supabase.auth.signOut();
    throw new Error("사용 중지 계정입니다. 관리자에게 문의하세요.");
  }

  const byEmailAny = await getUserByEmailAny(email);
  if (byEmailAny && !byEmailAny.is_active) {
    await supabase.auth.signOut();
    throw new Error("사용 중지 계정입니다. 관리자에게 문의하세요.");
  }

  const byEmail = await getActiveUserByEmail(email);
  console.log("[auth] profile lookup by email:", email, "→", byEmail ? "found" : "not found", byEmail);

  if (byEmail) {
    const updated = (await updateUserAuthLink(byEmail.id, user.id)) as UserRow;
    await assertUserApproved(updated);
    return toAuthProfile(user, updated);
  }

  try {
    const created = await createActiveUserFromAuth({
      authUserId: user.id,
      email,
      name: normalizeName(user),
    });
    console.log("[auth] created public.users row for auth user:", user.id);
    await assertUserApproved(created);
    return toAuthProfile(user, created);
  } catch (createErr) {
    const again = await getUserProfileByAuthId(user.id);
    if (again) {
      console.log("[auth] profile appeared after create race, using row:", again.id);
      await assertUserApproved(again);
      return toAuthProfile(user, again);
    }
    await supabase.auth.signOut();
    const hint =
      createErr instanceof Error ? createErr.message : "users 행 생성에 실패했습니다.";
    throw new Error(
      `CRM 프로필 없음: public.users 행이 없고 자동 생성도 되지 않았습니다. ${hint} 관리자에게 계정을 요청하거나 RLS·INSERT 정책을 확인하세요.`
    );
  }
}

/**
 * 앱 초기화·새로고침용. 세션이 있으면 `getSession()`의 user를 우선 사용해
 * signIn 직후 레이스와 일부 환경에서의 "Auth session missing"을 줄입니다.
 */
export async function getCurrentAuthProfile() {
  console.log("[auth] getCurrentAuthProfile start");
  if (shouldSkipCrmProfileResolution()) {
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
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
      throw userError;
    }
    user = fetched;
  }

  if (!user) {
    return null;
  }

  console.log("userId:", user.id);
  return resolveAuthProfile(user);
}
