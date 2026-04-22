"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_components/auth/AuthProvider";

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MyReportPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = (searchParams?.get("month") ?? monthNow()).trim();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace("/login");
      return;
    }
    router.replace(`/settlement/reports/${profile.userId}?month=${month}`);
  }, [loading, profile, router, month]);

  return <div className="py-16 text-center text-sm text-zinc-500">내 정산서로 이동 중…</div>;
}
