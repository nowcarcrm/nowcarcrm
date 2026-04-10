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
    if (!loading && !profile) {
      console.log("[admin-layout] profile missing, redirect /login");
      router.replace("/login");
    }
  }, [loading, profile, router]);

  if (loading || !profile) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">
        인증 상태 확인 중...
      </div>
    );
  }

  return (
    <AdminShell
      currentUser={{
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
