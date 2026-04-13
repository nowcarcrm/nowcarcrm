"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { signInWithEmailAndResolveProfile } from "../(admin)/_lib/authSupabase";
import { getSupabaseAuthTargetInfo } from "../(admin)/_lib/supabaseClient";
import { authErrorMessageKo, enhanceInvalidLoginWithDiagnose } from "../_lib/authErrorMessages";
import { AuthFooterNote } from "../_components/auth/AuthMarketingLayout";
import { NowcarLoginShell } from "../_components/auth/NowcarLoginLayout";
import { useAuth } from "../_components/auth/AuthProvider";
import { getPostLoginPath } from "../_lib/authPostLogin";

const cardMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
};

export default function LoginPage() {
  const router = useRouter();
  const { profile, authError, applySignedInProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const showDebugPanel = process.env.NODE_ENV !== "production";
  const target = getSupabaseAuthTargetInfo();

  const clearFormError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (profile) {
      const path = getPostLoginPath(profile);
      router.replace(path);
    }
  }, [profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearFormError();
    setDebugInfo(null);
    try {
      const nextProfile = await signInWithEmailAndResolveProfile(
        email.trim().toLowerCase(),
        password
      );
      applySignedInProfile(nextProfile);
      router.replace(getPostLoginPath(nextProfile));
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
      const message = enhanceInvalidLoginWithDiagnose(raw, debug.authDiagnose);
      setError(message);
      toast.error(message, { duration: 4800 });
    } finally {
      setLoading(false);
    }
  }

  const displayAuthError = authError ? authErrorMessageKo(authError) : "";

  return (
    <NowcarLoginShell>
      <motion.div
        className="crm-auth-card w-full"
        initial={cardMotion.initial}
        animate={cardMotion.animate}
        transition={cardMotion.transition}
      >
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--nowcar-auth-text-muted)]">
            B2B Operations
          </p>
          <p className="mt-2 text-[1.65rem] font-bold tracking-tight text-[var(--nowcar-auth-navy-mid)] dark:text-slate-100">
            NOWCAR CRM
          </p>
        </div>

        <h1 className="crm-auth-title">로그인</h1>
        <p className="crm-auth-desc">계정으로 접속하세요</p>

        {error ? (
          <div className="crm-auth-error-soft" role="alert">
            {error}
          </div>
        ) : null}
        {!error && displayAuthError ? (
          <div className="crm-auth-error-soft" role="alert">
            {displayAuthError}
          </div>
        ) : null}
        {showDebugPanel && !error && authError ? (
          <div className="mt-3 rounded-lg border border-[var(--nowcar-auth-border)] bg-[var(--nowcar-auth-surface)] px-3 py-2 text-left text-[11px] text-[var(--nowcar-auth-text-muted)]">
            원인(raw): {authError}
          </div>
        ) : null}
        {showDebugPanel && debugInfo ? (
          <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-left text-[12px] leading-relaxed text-amber-950">
            <div className="font-semibold">로그인 실패 디버그 정보(개발)</div>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-8">
          <div className="space-y-5">
            <div>
              <label htmlFor="login-email" className="crm-auth-label">
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                className="crm-auth-field"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="crm-auth-label">
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="비밀번호"
                className="crm-auth-field"
                required
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" className="crm-auth-btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  aria-hidden
                />
                로그인 중…
              </>
            ) : (
              "로그인"
            )}
          </button>
        </form>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-[var(--nowcar-auth-border)] pt-7">
          <Link href="/signup" className="crm-auth-link">
            회원가입
          </Link>
          <span className="text-[11px] text-[var(--nowcar-auth-text-muted)]/80" aria-hidden>
            ·
          </span>
          <Link href="/forgot-password" className="crm-auth-link">
            비밀번호 재설정
          </Link>
        </div>

        <AuthFooterNote className="crm-auth-footnote !mt-6 border-t-0 pt-0 text-[12px]" />
      </motion.div>
    </NowcarLoginShell>
  );
}
