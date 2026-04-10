"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import { authErrorMessageKo } from "@/app/_lib/authErrorMessages";
import {
  AuthBrandHeader,
  AuthErrorBanner,
  AuthFooterNote,
  AuthMarketingBackground,
  AuthMarketingCard,
  AuthPrimaryButton,
  authFieldClass,
  authLabelClass,
} from "@/app/_components/auth/AuthMarketingLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("이메일을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
      if (resetErr) throw resetErr;
      setSent(true);
      toast.success("재설정 링크를 메일로 보냈습니다. 메일함을 확인해 주세요.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(authErrorMessageKo(raw));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthMarketingBackground>
      <AuthMarketingCard>
        <AuthBrandHeader />

        <h2 className="text-base font-bold text-[#0f172a] dark:text-zinc-50">비밀번호 재설정</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          가입한 이메일을 입력하시면
          <br />
          비밀번호를 다시 설정할 수 있는 링크를 보내드립니다.
        </p>

        <AuthErrorBanner message={error ?? ""} />

        {sent ? (
          <p className="mt-5 rounded-[12px] border border-emerald-200/90 bg-emerald-50/90 px-3.5 py-3 text-[13px] text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-100">
            메일이 오지 않으면 스팸함을 확인하거나, 이메일 주소가 맞는지 확인해 주세요.
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-5">
          <div>
            <label htmlFor="forgot-email" className={authLabelClass}>
              이메일
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authFieldClass}
              autoComplete="email"
              placeholder="name@company.com"
              required
            />
          </div>
          <AuthPrimaryButton disabled={busy}>
            {busy ? "전송 중…" : "재설정 링크 보내기"}
          </AuthPrimaryButton>
        </form>

        <div className="mt-5 text-center text-[13px]">
          <Link
            href="/login"
            className="font-semibold text-[#5B5FFF] hover:text-[#7C3AED] dark:text-indigo-400"
          >
            로그인으로 돌아가기
          </Link>
        </div>

        <AuthFooterNote />
      </AuthMarketingCard>
    </AuthMarketingBackground>
  );
}
