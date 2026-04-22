"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { isCeo, isDirector } from "../../_lib/settlement/permissions";
import { supabase } from "../../_lib/supabaseClient";

type AuditRow = {
  id: string;
  action: string;
  performer_name: string;
  target_user_name: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

function dateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SettlementAuditPage() {
  const { profile, loading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [start, setStart] = useState(dateOnly(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [end, setEnd] = useState(dateOnly(new Date()));
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const canRead = useMemo(() => {
    if (!profile) return false;
    return isSuperAdmin(profile) || isDirector(profile) || isCeo(profile);
  }, [profile]);

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function load() {
    setBusy(true);
    try {
      const token = await getToken();
      const qs = new URLSearchParams({
        limit: "50",
        offset: String(offset),
        start,
        end,
      });
      if (action) qs.set("action", action);
      const res = await fetch(`/api/settlement/audit?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { logs?: AuditRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      setRows(json.logs ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && canRead) void load();
  }, [loading, canRead, action, start, end, offset]);

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!canRead) return <div className="py-16 text-center text-sm text-rose-600">403 · 본부장 이상만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <h1 className="text-xl font-bold">정산 감사 로그</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="crm-field w-48" placeholder="액션" value={action} onChange={(e) => setAction(e.target.value)} />
          <input className="crm-field w-40" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="crm-field w-40" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </header>
      <section className="crm-card p-5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">일시</th>
                <th className="px-3 py-2">액션</th>
                <th className="px-3 py-2">작업자</th>
                <th className="px-3 py-2">대상자</th>
                <th className="px-3 py-2">상세</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td className="px-3 py-3 text-zinc-500" colSpan={5}>불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-3 text-zinc-500" colSpan={5}>로그가 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2">{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2">{r.performer_name}</td>
                    <td className="px-3 py-2">{r.target_user_name || "-"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{r.details ? JSON.stringify(r.details) : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="crm-btn-secondary" disabled={offset === 0} onClick={() => setOffset((v) => Math.max(0, v - 50))}>
            이전
          </button>
          <button type="button" className="crm-btn-secondary" onClick={() => setOffset((v) => v + 50)}>
            더 보기
          </button>
        </div>
      </section>
    </div>
  );
}
