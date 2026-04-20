"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import toast from "react-hot-toast";
import { signInWithEmailAndResolveProfile } from "../(admin)/_lib/authSupabase";
import { getSupabaseAuthTargetInfo, supabase } from "../(admin)/_lib/supabaseClient";
import { authErrorMessageKo, enhanceInvalidLoginWithDiagnose } from "../_lib/authErrorMessages";
import { NowcarLoginShell } from "../_components/auth/NowcarLoginLayout";
import { useAuth } from "../_components/auth/AuthProvider";
import { getPostLoginPath } from "../_lib/authPostLogin";
import {
  loginCardMotion,
  loginFormItem,
  loginFormStagger,
  loginTitleMotion,
} from "../_lib/crmMotion";

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const reduce = !!reduceMotion;
  const { profile, authError, applySignedInProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const showDebugPanel = false;
  const target = getSupabaseAuthTargetInfo();

  const cardM = loginCardMotion(reduce);
  const titleM = loginTitleMotion(reduce);
  const formStagger = loginFormStagger(reduce);
  const formItem = loginFormItem(reduce);

  const clearFormError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (profile) {
      const path = getPostLoginPath(profile);
      router.replace(path);
    }
  }, [profile, router]);

  function failureReasonFromError(err: unknown): string {
    const anyErr = err as { message?: string; status?: number; code?: string };
    const msg = (anyErr?.message ?? "").toLowerCase();
    const code = (anyErr?.code ?? "").toLowerCase();
    if (code === "user_not_found" || msg.includes("user not found") || msg.includes("invalid login credentials")) {
      return "존재하지 않는 계정 또는 잘못된 비밀번호";
    }
    if (msg.includes("invalid") && msg.includes("password")) {
      return "잘못된 비밀번호";
    }
    if (msg.includes("crm 프로필") || msg.includes("프로필")) {
      return "CRM 프로필 확인 실패";
    }
    if (msg.includes("승인") || msg.includes("approval")) {
      return "미승인 계정";
    }
    if (msg.includes("비활성") || msg.includes("중지")) {
      return "사용 중지된 계정";
    }
    return anyErr?.message?.slice(0, 200) || "로그인 실패";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearFormError();
    setDebugInfo(null);
    const emailNorm = email.trim().toLowerCase();
    try {
      const lockRes = await fetch(`/api/auth/login-lock?email=${encodeURIComponent(emailNorm)}`);
      if (lockRes.status === 423) {
        const j = (await lockRes.json().catch(() => ({}))) as { message?: string };
        setError(j.message ?? "로그인이 일시 제한되었습니다.");
        toast.error(j.message ?? "로그인이 일시 제한되었습니다.", { duration: 5000 });
        return;
      }
      const nextProfile = await signInWithEmailAndResolveProfile(emailNorm, password);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/auth/login-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: true, accessToken: session.access_token }),
        }).catch(() => {});
      }
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
      if (showDebugPanel) {
        setDebugInfo(debug);
      }
      const message = enhanceInvalidLoginWithDiagnose(raw, debug.authDiagnose);
      setError(message);
      toast.error("로그인에 실패했습니다. 이메일·비밀번호를 확인해 주세요.", { duration: 4000 });
      void fetch("/api/auth/login-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          email: emailNorm,
          failureReason: failureReasonFromError(err),
        }),
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  const displayAuthError = authError ? authErrorMessageKo(authError) : "";

  return (
    <NowcarLoginShell>
      <motion.div
        className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-[0_24px_56px_rgba(15,23,42,0.12)] sm:px-8 sm:py-9"
        initial={cardM.initial}
        animate={cardM.animate}
        transition={cardM.transition}
      >
        <motion.div
          className="mb-7 text-center"
          initial={titleM.initial}
          animate={titleM.animate}
          transition={titleM.transition}
        >
          <Image
            src="/images/nowcar-ai-logo.png"
            alt="NOWCAR"
            width={80}
            height={28}
            className="mx-auto h-auto w-[80px]"
            priority
          />
          <p className="mt-3 text-[24px] font-bold tracking-tight text-[#1e293b]">로그인</p>
          <p className="mt-1 text-[14px] font-medium text-slate-400">계정으로 접속하세요</p>
        </motion.div>

        {error ? (
          <motion.div
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {error}
          </motion.div>
        ) : null}
        {!error && displayAuthError ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
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

        <form onSubmit={onSubmit} className="mt-2">
          <motion.div
            className="space-y-5"
            variants={formStagger}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={formItem}>
              <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700">
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                className="h-[50px] w-full rounded-xl border border-[#e2e8f0] bg-white px-4 text-[15px] text-slate-900 outline-none transition-all duration-200 focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[#3b82f6]/10"
                required
                disabled={loading}
              />
            </motion.div>
            <motion.div variants={formItem}>
              <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-700">
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="비밀번호"
                className="h-[50px] w-full rounded-xl border border-[#e2e8f0] bg-white px-4 text-[15px] text-slate-900 outline-none transition-all duration-200 focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[#3b82f6]/10"
                required
                disabled={loading}
              />
            </motion.div>
            <motion.div variants={formItem}>
              <button
                type="submit"
                className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border-0 bg-[linear-gradient(135deg,#1e40af,#3b82f6)] text-base font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_10px_24px_rgba(59,130,246,0.35)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={loading}
              >
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
            </motion.div>
          </motion.div>
        </form>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-slate-200 pt-6">
          <Link href="/signup" className="text-sm font-semibold text-[#1e40af] hover:text-[#1d368f]">
            회원가입
          </Link>
          <span className="text-xs text-slate-400" aria-hidden>
            ·
          </span>
          <Link href="/forgot-password" className="text-sm font-semibold text-[#1e40af] hover:text-[#1d368f]">
            비밀번호 재설정
          </Link>
        </div>

        <p className="mt-6 text-center text-[12px] text-slate-500">© 2026 ㈜나우카</p>
      </motion.div>
    </NowcarLoginShell>
  );
}
