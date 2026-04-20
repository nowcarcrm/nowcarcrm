"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../../_lib/supabaseClient";

type LogRow = Record<string, unknown> & {
  staffName?: string;
  staffRank?: string;
  staffRole?: string;
};

type StaffOpt = { id: string; name: string | null; rank: string | null; role: string | null };

export default function AdminLoginLogsPage() {
  const { profile, loading } = useAuth();
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
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
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    if (userId) sp.set("userId", userId);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (status === "success" || status === "failed") sp.set("status", status);
    const res = await fetch(`/api/admin/login-logs?${sp.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "조회 실패");
      return;
    }
    const j = (await res.json()) as { items: LogRow[]; total: number };
    setItems(j.items ?? []);
    setTotal(j.total ?? 0);
  }, [canView, page, userId, from, to, status]);

  useEffect(() => {
    if (!canView || loading) return;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/admin/user-options", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const j = (await res.json()) as { users: StaffOpt[] };
        setStaff(j.users ?? []);
      }
    })();
  }, [canView, loading]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile) {
    return <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>;
  }
  if (!canView) {
    return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;
  }

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50">로그인 이력</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">최신순 · 페이지당 {pageSize}건</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
          직원
          <select
            className="crm-field crm-field-select mt-1 block min-w-[180px] text-sm"
            value={userId}
            onChange={(e) => {
              setPage(1);
              setUserId(e.target.value);
            }}
          >
            <option value="">전체</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
          시작일
          <input
            type="date"
            className="crm-field mt-1 block text-sm"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
          종료일
          <input
            type="date"
            className="crm-field mt-1 block text-sm"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
          상태
          <select
            className="crm-field crm-field-select mt-1 block text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">전체</option>
            <option value="success">성공</option>
            <option value="failed">실패</option>
          </select>
        </label>
        <button type="button" className="crm-btn-secondary px-3 py-2 text-sm" onClick={() => void load()}>
          새로고침
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">일시</th>
              <th className="px-3 py-2">직원</th>
              <th className="px-3 py-2">직급</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">디바이스</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">해외IP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={String(r.id)} className="border-b border-slate-100 dark:border-zinc-800">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-800 dark:text-zinc-200">
                    {r.login_at ? String(r.login_at).replace("T", " ").slice(0, 19) : "—"}
                  </td>
                  <td className="px-3 py-2">{String(r.staffName ?? "—")}</td>
                  <td className="px-3 py-2">{String(r.staffRank ?? "—")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(r.ip_address ?? "—")}</td>
                  <td className="px-3 py-2">{String(r.device_info ?? "—")}</td>
                  <td className="px-3 py-2">{String(r.login_status ?? "—")}</td>
                  <td className="px-3 py-2">{r.foreign_ip_warning ? "경고" : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600 dark:text-zinc-400">
          총 {total}건 · {page}/{totalPages}페이지
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="crm-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            이전
          </button>
          <button
            type="button"
            className="crm-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
