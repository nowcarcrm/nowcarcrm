"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndResolveProfile } from "../(admin)/_lib/authSupabase";
import { authErrorMessageKo } from "../_lib/authErrorMessages";
import {
  AuthBrandHeader,
  AuthErrorBanner,
  AuthFooterNote,
  AuthMarketingBackground,
  AuthMarketingCard,
  AuthPrimaryButton,
  authFieldClass,
  authLabelClass,
} from "../_components/auth/AuthMarketingLayout";
import { useAuth } from "../_components/auth/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { profile, authError, applySignedInProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearFormError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (profile) {
      console.log("[login-page] profile ready, redirect /dashboard", {
        userId: profile.userId,
        role: profile.role,
      });
      router.replace("/dashboard");
    }
  }, [profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearFormError();
    console.log("[login-page] submit start");
    try {
      const nextProfile = await signInWithEmailAndResolveProfile(
        email.trim().toLowerCase(),
        password
      );
      applySignedInProfile(nextProfile);
      console.log("[login-page] applySignedInProfile + redirect", {
        userId: nextProfile.userId,
        role: nextProfile.role,
      });
      router.replace("/dashboard");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      console.error("[login-page] submit error", raw, err);
      setError(authErrorMessageKo(raw));
    } finally {
      setLoading(false);
    }
  }

  const displayAuthError = authError ? authErrorMessageKo(authError) : "";

  return (
    <AuthMarketingBackground>
      <AuthMarketingCard>
        <AuthBrandHeader />

        <p className="text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          승인된 계정으로 로그인 후
          <br />
          고객, 계약, 근태 업무를 관리하세요.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          신규 직원은 회원가입 후
          <br />
          관리자 승인을 받아주세요.
        </p>

        <AuthErrorBanner message={error ?? displayAuthError} />

        <form onSubmit={onSubmit} className="mt-5">
          <div className="space-y-4">
            <div>
              <label htmlFor="login-email" className={authLabelClass}>
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                className={authFieldClass}
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className={authLabelClass}>
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="비밀번호 입력"
                className={authFieldClass}
                required
              />
            </div>
          </div>

          <AuthPrimaryButton disabled={loading}>{loading ? "로그인 중…" : "로그인"}</AuthPrimaryButton>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium">
          <Link
            href="/signup"
            className="text-[#5B5FFF] transition-colors hover:text-[#7C3AED] dark:text-indigo-400 dark:hover:text-violet-300"
          >
            회원가입
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            |
          </span>
          <Link
            href="/forgot-password"
            className="text-[#5B5FFF] transition-colors hover:text-[#7C3AED] dark:text-indigo-400 dark:hover:text-violet-300"
          >
            비밀번호 재설정
          </Link>
        </div>

        <AuthFooterNote />
      </AuthMarketingCard>
    </AuthMarketingBackground>
  );
}
