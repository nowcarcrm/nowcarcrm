"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../../_lib/supabaseClient";

type ExportSummary = {
  month: string;
  totalExports: number;
  byUser: { userId: string; count: number; name: string }[];
  anomalies: { userId: string; day: string; count: number }[];
};

export default function AdminExportLogsPage() {
  const { profile, loading } = useAuth();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [data, setData] = useState<ExportSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canView = useMemo(
    () =>
      profile
        ? isSuperAdmin({ email: profile.email, role: profile.role, rank: profile.rank })
        : false,
    [profile]
  );

  const load = useCallback(async () => {
    if (!canView) return;
    setErr(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setErr("로그인이 필요합니다.");
      return;
    }
    const res = await fetch(`/api/admin/export-logs?month=${encodeURIComponent(month)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "조회 실패");
      setData(null);
      return;
    }
    setData((await res.json()) as ExportSummary);
  }, [canView, month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile) {
    return <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>;
  }
  if (!canView) {
    return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50">보내기 이력</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">월별 통계 · 직원별 횟수 · 1일 5회 이상 비정상</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
            월
            <input
              type="month"
              className="crm-field mt-1 block text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button type="button" className="crm-btn-secondary mt-5 px-3 py-2 text-sm" onClick={() => void load()}>
            조회
          </button>
        </div>
      </header>

      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold text-slate-800 dark:text-zinc-100">요약</div>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              {data.month} · 총 {data.totalExports}회보내기
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold dark:border-zinc-800">
              직원별 횟수
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {data.byUser.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">데이터 없음</li>
              ) : (
                data.byUser.map((u) => (
                  <li key={u.userId} className="flex justify-between px-4 py-2 text-sm">
                    <span>{u.name}</span>
                    <span className="font-mono">{u.count}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">비정상 패턴 (1일 5회 이상)</div>
            {data.anomalies.length === 0 ? (
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/90">해당 없음</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-amber-950 dark:text-amber-100">
                {data.anomalies.map((a, i) => {
                  const nm = data.byUser.find((u) => u.userId === a.userId)?.name ?? a.userId;
                  return (
                    <li key={`${a.userId}-${a.day}-${i}`}>
                      {nm} · {a.day} · {a.count}회
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
