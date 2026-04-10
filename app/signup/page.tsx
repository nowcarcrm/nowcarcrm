"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import { createPendingStaffProfileFromAuth } from "@/app/(admin)/_lib/usersSupabase";
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

export default function SignupPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    console.log("[signup] signUp start", { email: trimmedEmail });
    if (!trimmedName || !trimmedEmail || !password) {
      toast.error("이름, 이메일, 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { name: trimmedName },
        },
      });
      if (error) throw error;
      console.log("[signup] signUp result", {
        userId: data.user?.id,
        email: data.user?.email,
        hasSession: !!data.session,
      });

      const user = data.user;
      if (user?.id && user.email) {
        try {
          await createPendingStaffProfileFromAuth({
            authUserId: user.id,
            email: user.email,
            name: trimmedName,
          });
        } catch (insertErr) {
          const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
          if (!/duplicate|unique|23505/i.test(msg)) {
            console.warn("[signup] users 보조 삽입:", insertErr);
          }
        }
      }

      toast.success("가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
      router.replace("/login");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "회원가입에 실패했습니다.";
      toast.error(authErrorMessageKo(raw));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthMarketingBackground>
      <AuthMarketingCard>
        <AuthBrandHeader />

        <h2 className="text-base font-bold text-[#0f172a] dark:text-zinc-50">직원 회원가입</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          가입 후 관리자 승인이 있어야 CRM에 로그인할 수 있습니다.
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
