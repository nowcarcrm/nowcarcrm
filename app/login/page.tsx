"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndResolveProfile } from "../(admin)/_lib/authSupabase";
import { getSupabaseAuthTargetInfo } from "../(admin)/_lib/supabaseClient";
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
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const target = getSupabaseAuthTargetInfo();

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
    setDebugInfo(null);
    console.log("[login-page] submit start");
    console.log("[login-page] supabase target url", target.url);
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
      const anyErr = err as {
        message?: string;
        status?: number;
        code?: string;
        name?: string;
      };
      const debug: Record<string, unknown> = {
        step: "signInWithPassword/resolveProfile",
        targetUrl: target.url,
        projectRef: target.projectRef,
        expectedProjectRef: target.expectedProjectRef,
        projectRefMatch: target.projectRefMatch,
        errorName: anyErr?.name ?? null,
        errorMessage: anyErr?.message ?? raw,
        errorStatus: anyErr?.status ?? null,
        errorCode: anyErr?.code ?? null,
      };
      try {
        const res = await fetch("/api/auth/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        const diag = (await res.json()) as unknown;
        debug.authDiagnose = diag;
      } catch (diagErr) {
        debug.authDiagnoseError =
          diagErr instanceof Error ? diagErr.message : "diagnose 호출 실패";
      }
      setDebugInfo(debug);
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
        {!error && authError ? (
          <div className="mt-2 rounded-lg border border-zinc-300/70 bg-zinc-50/90 px-3 py-2 text-[12px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
            원인(raw): {authError}
          </div>
        ) : null}
        {debugInfo ? (
          <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-left text-[12px] leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="font-semibold">로그인 실패 디버그 정보(임시)</div>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        ) : null}

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
