"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthBrandHeader,
  AuthMarketingBackground,
  AuthMarketingCard,
} from "@/app/_components/auth/AuthMarketingLayout";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { getPostLoginPath } from "@/app/_lib/authPostLogin";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { profile, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace("/login");
      return;
    }
    if (!profile.isActive) {
      void logout();
      return;
    }
    if (profile.role === "admin" || (profile.role === "staff" && profile.approved)) {
      router.replace(getPostLoginPath(profile));
    }
  }, [loading, profile, router, logout]);

  if (loading || !profile) {
    return (
      <AuthMarketingBackground>
        <AuthMarketingCard>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">확인 중…</p>
        </AuthMarketingCard>
      </AuthMarketingBackground>
    );
  }

  if (profile.role !== "staff" || profile.approved) {
    return null;
  }

  return (
    <AuthMarketingBackground>
      <AuthMarketingCard>
        <AuthBrandHeader />
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          관리자 승인 대기중입니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          계정은 활성화되어 있으나, 관리자 승인 전까지는 고객·계약·근태 등 주요 CRM 기능을 사용할 수 없습니다.
          승인이 완료되면 로그인 상태에서 자동으로 업무 화면으로 이동할 수 있습니다.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          문의가 필요하면 사내 관리자에게 연락해 주세요.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="flex h-[50px] w-full items-center justify-center rounded-[12px] bg-gradient-to-br from-[#5B5FFF] to-[#7C3AED] text-[15px] font-semibold text-white shadow-[0_8px_28px_-8px_rgba(91,95,255,0.55)] transition-shadow hover:brightness-[1.06] active:scale-[0.98]"
          >
            로그아웃
          </button>
          <Link
            href="/login"
            className="text-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            로그인 화면으로
          </Link>
        </div>
      </AuthMarketingCard>
    </AuthMarketingBackground>
  );
}
