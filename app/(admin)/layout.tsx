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
      <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">
        인증 상태 확인 중...
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
        email: profile.email || "",
      }}
      onLogout={() => void logout()}
    >
      {children}
    </AdminShell>
  );
}
