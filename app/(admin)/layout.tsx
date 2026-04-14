"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../_components/admin/AdminShell";
import { useAuth } from "../_components/auth/AuthProvider";
import { roleLabelKo } from "./_lib/usersSupabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
    if (profile.role === "staff" && !profile.approved) {
      router.replace("/pending-approval");
    }
  }, [loading, profile, router, logout]);

  if (loading || !profile) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-[280px] space-y-4" aria-busy="true" aria-label="인증 상태 확인 중">
          <div className="crm-skeleton mx-auto h-3 w-[45%] rounded-md" />
          <div className="crm-skeleton h-28 w-full rounded-2xl" />
          <div className="space-y-2">
            <div className="crm-skeleton h-2.5 w-full rounded-md" />
            <div className="crm-skeleton h-2.5 w-4/5 rounded-md" />
          </div>
          <p className="text-center text-[13px] text-zinc-500">인증 상태 확인 중…</p>
        </div>
      </div>
    );
  }

  if (!profile.isActive) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">
        계정이 비활성화되었습니다. 잠시 후 로그아웃됩니다.
      </div>
    );
  }

  if (profile.role === "staff" && !profile.approved) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">
        승인 대기 페이지로 이동합니다…
      </div>
    );
  }

  return (
    <AdminShell
      currentUser={{
        userId: profile.userId,
        name: profile.name?.trim() || profile.email?.split("@")[0] || "사용자",
        role: profile.role,
        roleLabel: roleLabelKo(profile.role),
        position: profile.position ?? "직급 미설정",
        email: profile.email || "",
      }}
      onLogout={() => void logout()}
    >
      {children}
    </AdminShell>
  );
}
