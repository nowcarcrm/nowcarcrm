"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getSupabaseAuthTargetInfo, supabase } from "@/app/(admin)/_lib/supabaseClient";
import {
  createPendingStaffProfileFromAuth,
  effectiveApprovalStatus,
  getUserProfileByAuthId,
  type UserRow,
} from "@/app/(admin)/_lib/usersSupabase";
import { authErrorMessageKo } from "@/app/_lib/authErrorMessages";
import {
  AuthBrandHeader,
  AuthFooterNote,
  AuthMarketingBackground,
  AuthMarketingCard,
  AuthPrimaryButton,
  authFieldClass,
  authLabelClass,
} from "@/app/_components/auth/AuthMarketingLayout";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { getPostLoginPath } from "@/app/_lib/authPostLogin";

export default function SignupPage() {
  const SIGNUP_DEBUG_VERSION = "signup-diagnose-2026-04-10-v1";
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [helper, setHelper] = useState<string | null>(null);
  const authTarget = getSupabaseAuthTargetInfo();

  useEffect(() => {
    if (!loading && profile) {
      router.replace(getPostLoginPath(profile));
    }
  }, [loading, profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    console.log("[signup] signUp start", {
      version: SIGNUP_DEBUG_VERSION,
      email: trimmedEmail,
      authTarget,
    });
    if (!trimmedName || !trimmedEmail || !password) {
      toast.error("이름, 이메일, 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setHelper(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { name: trimmedName },
        },
      });
      const signUpSuccess = !error;
      console.log("[signup][AUTH_SIGNUP] result", {
        success: signUpSuccess,
        error,
        userId: data.user?.id,
        email: data.user?.email,
        hasSession: !!data.session,
      });
      if (error) {
        const eObj = error as {
          message?: string;
          code?: string;
          details?: string;
          status?: number;
          name?: string;
        };
        console.error("[signup][AUTH_SIGNUP] failed", {
          message: eObj.message ?? null,
          code: eObj.code ?? null,
          details: eObj.details ?? null,
          status: eObj.status ?? null,
          name: eObj.name ?? null,
          raw: error,
        });
        throw error;
      }

      const user = data.user;
      if (!user?.id || !user.email) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error("회원가입은 완료되었지만 사용자 식별값이 없습니다. 다시 시도해 주세요.");
      }

      const accessToken = data.session?.access_token ?? null;
      let insertResult: unknown = null;
      let profileFromServer = false;

      if (accessToken) {
        try {
          const res = await fetch("/api/auth/ensure-signup-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              authUserId: user.id,
              email: user.email,
              name: trimmedName,
            }),
          });
          const json = (await res.json()) as { ok?: boolean; row?: unknown; error?: string };
          if (res.ok && json.ok !== false) {
            profileFromServer = true;
            insertResult = json.row ?? json;
            console.log("[signup][ENSURE_PROFILE_API] success", {
              userId: user.id,
              insertResult,
            });
          } else {
            console.error("[signup][ENSURE_PROFILE_API] failed raw", {
              status: res.status,
              body: json,
            });
          }
        } catch (apiErr) {
          console.error("[signup][ENSURE_PROFILE_API] exception raw", apiErr);
        }
      }

      if (!profileFromServer) {
        try {
          console.log("[signup][PUBLIC_USERS_INSERT] before call", {
            userId: user.id,
            email: user.email,
            name: trimmedName,
          });
          insertResult = await createPendingStaffProfileFromAuth({
            authUserId: user.id,
            email: user.email,
            name: trimmedName,
          });
          console.log("[signup][PUBLIC_USERS_INSERT] after call", {
            userId: user.id,
            email: user.email,
            name: trimmedName,
            insertResult,
          });
        } catch (insertErr) {
          const rawLog =
            insertErr && typeof insertErr === "object" && insertErr !== null
              ? {
                  ...(insertErr as object),
                  message:
                    insertErr instanceof Error
                      ? insertErr.message
                      : "message" in insertErr
                        ? String((insertErr as { message: unknown }).message)
                        : undefined,
                }
              : insertErr;
          console.error("[signup][PUBLIC_USERS_INSERT] failed raw", { raw: rawLog, insertErr });
          await supabase.auth.signOut().catch(() => {});
          const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
          throw new Error(
            `CRM 프로필 생성 실패: ${msg}. 관리자에게 users INSERT/RLS 정책을 확인해 달라고 요청하세요.`
          );
        }
      }

      let verified: UserRow | null = null;
      try {
        verified = await getUserProfileByAuthId(user.id);
      } catch (verifyErr) {
        await supabase.auth.signOut().catch(() => {});
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        throw new Error(`CRM 프로필 확인 실패: ${msg}`);
      }
      const usersExists = !!verified;
      const role = verified?.role ?? null;
      const approvalEffective = effectiveApprovalStatus({
        approval_status: verified?.approval_status ?? null,
      });
      const isRoleValid = role === "staff";
      const isApprovalValid = approvalEffective === "pending";
      const verifyOk = usersExists && isRoleValid && isApprovalValid;

      console.log("[signup][PUBLIC_USERS_VERIFY] result", {
        userId: user.id,
        email: user.email,
        usersRowExists: usersExists,
        usersInsertResult: insertResult,
        role,
        approval_status: verified?.approval_status ?? null,
        approval_effective: approvalEffective,
        row: verified,
        verifyOk,
        failureReason: !usersExists
          ? "users row missing"
          : !isRoleValid
            ? `invalid role: ${String(role)}`
            : !isApprovalValid
              ? `invalid approval (effective): ${String(approvalEffective)}`
              : null,
      });

      if (!verifyOk) {
        await supabase.auth.signOut().catch(() => {});
        if (!usersExists) {
          throw new Error("직원 계정 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
        if (!isRoleValid) {
          throw new Error("직원 계정 권한 설정이 올바르지 않습니다. 관리자에게 문의하세요.");
        }
        if (!isApprovalValid) {
          throw new Error("직원 계정 승인 상태 설정이 올바르지 않습니다. 관리자에게 문의하세요.");
        }
      }

      toast.success("가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
      router.replace("/login");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "회원가입에 실패했습니다.";
      const lower = raw.toLowerCase();
      const mapped = authErrorMessageKo(raw);
      console.error("[signup] signUp failed(raw)", { raw, mapped });
      if (lower.includes("too many requests") || lower.includes("rate limit")) {
        setHelper("같은 이메일로 요청이 너무 자주 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
      toast.error(mapped);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthMarketingBackground>
      <AuthMarketingCard>
        <AuthBrandHeader />

        <h2 className="text-base font-bold text-[#0f172a] dark:text-zinc-50">나우카 CRM 회원가입</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          나우카 고객관리 CRM에서 가입한 계정은 승인 대기 상태로 등록되며, 관리자 승인 후 로그인할 수 있습니다.
        </p>

        <form onSubmit={onSubmit} className="mt-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="signup-name" className={authLabelClass}>
                이름 (표시명)
              </label>
              <input
                id="signup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={authFieldClass}
                autoComplete="name"
                placeholder="홍길동"
                required
              />
            </div>
            <div>
              <label htmlFor="signup-email" className={authLabelClass}>
                이메일
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authFieldClass}
                autoComplete="email"
                placeholder="name@company.com"
                required
              />
            </div>
            <div>
              <label htmlFor="signup-password" className={authLabelClass}>
                비밀번호 (6자 이상)
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authFieldClass}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="6자 이상 입력"
              />
            </div>
          </div>

          <AuthPrimaryButton disabled={busy}>{busy ? "가입 중…" : "회원가입"}</AuthPrimaryButton>
          {helper ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {helper}
            </div>
          ) : null}
        </form>

        <div className="mt-5 text-center text-[13px] text-zinc-600 dark:text-zinc-400">
          이미 계정이 있나요?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#5B5FFF] hover:text-[#7C3AED] dark:text-indigo-400"
          >
            로그인
          </Link>
        </div>

        <AuthFooterNote />
      </AuthMarketingCard>
    </AuthMarketingBackground>
  );
}
