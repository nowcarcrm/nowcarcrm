"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { CurrencyInput } from "@/app/_components/settlement/CurrencyInput";
import { MonthNavigator } from "@/app/_components/settlement/MonthNavigator";
import { OwnerSelect } from "@/app/_components/settlement/OwnerSelect";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { supabase } from "../../_lib/supabaseClient";
import { formatCurrency } from "../../_lib/settlement/formatters";

type PrepaymentRow = {
  id: string;
  payment_date: string;
  source: string;
  amount: number;
  target_user_id: string;
  target_month: string;
  notes: string | null;
  applied: boolean;
  target_user_name: string;
  target_user_rank: string;
};

type OwnerOption = {
  id: string;
  name: string;
  email: string;
  rank: string;
  team_name: string | null;
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PrepaymentsPage() {
  const { profile, loading } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [includeApplied, setIncludeApplied] = useState(false);
  const [rows, setRows] = useState<PrepaymentRow[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    payment_date: "",
    source: "",
    target_user_id: "",
    amount: 0,
    target_month: monthNow(),
    notes: "",
  });

  const canManage = useMemo(
    () => (profile ? isSuperAdmin({ email: profile.email, role: profile.role, rank: profile.rank }) : false),
    [profile]
  );

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadRows() {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/settlement/prepayments?month=${month}&include_applied=${includeApplied}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { rows?: PrepaymentRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      setRows(json.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  async function loadOwners() {
    const token = await getToken();
    const res = await fetch("/api/settlement/deliveries/available-owners", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { owners?: OwnerOption[] };
    if (res.ok) setOwners(json.owners ?? []);
  }

  useEffect(() => {
    if (!loading && profile && canManage) {
      void loadRows();
      void loadOwners();
    }
  }, [loading, profile, canManage, month, includeApplied]);

  async function createPrepayment() {
    try {
      const token = await getToken();
      const res = await fetch("/api/settlement/prepayments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          payment_date: form.payment_date,
          source: form.source,
          amount: form.amount,
          target_user_id: form.target_user_id,
          target_month: form.target_month,
          notes: form.notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "등록 실패");
      toast.success("등록되었습니다.");
      setOpen(false);
      await loadRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!canManage) return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">선지급 예치금 관리</h1>
          <button type="button" className="crm-btn-primary" onClick={() => setOpen(true)}>
            + 신규 등록
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <MonthNavigator currentMonth={month} />
          <label className="inline-flex items-center gap-1 text-sm text-zinc-600">
            <input type="checkbox" checked={includeApplied} onChange={(e) => setIncludeApplied(e.target.checked)} />
            반영완료 포함
          </label>
        </div>
      </header>

      <section className="crm-card p-5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">입금일</th>
                <th className="px-3 py-2">입금처</th>
                <th className="px-3 py-2">대상직원</th>
                <th className="px-3 py-2">금액</th>
                <th className="px-3 py-2">귀속월</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">메모</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td className="px-3 py-3 text-zinc-500" colSpan={7}>불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-3 text-zinc-500" colSpan={7}>표시할 데이터가 없습니다.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={`border-b border-zinc-100 ${r.applied ? "bg-zinc-50 text-zinc-500" : ""}`}>
                    <td className="px-3 py-2">{r.payment_date}</td>
                    <td className="px-3 py-2">{r.source}</td>
                    <td className="px-3 py-2">{r.target_user_name} {r.target_user_rank}</td>
                    <td className="px-3 py-2">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-2">{r.target_month}</td>
                    <td className="px-3 py-2">{r.applied ? "반영완료" : "대기"}</td>
                    <td className="px-3 py-2">{r.notes ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">선지급 신규 등록</h2>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">입금일<input className="crm-field mt-1" type="date" value={form.payment_date} onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))} /></label>
              <label className="text-sm">입금처<input className="crm-field mt-1" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} /></label>
              <label className="text-sm">대상 직원<OwnerSelect value={form.target_user_id} onChange={(v) => setForm((p) => ({ ...p, target_user_id: v }))} options={owners} /></label>
              <label className="text-sm">금액<CurrencyInput value={form.amount} onChange={(v) => setForm((p) => ({ ...p, amount: v }))} /></label>
              <label className="text-sm">귀속월<input className="crm-field mt-1" value={form.target_month} onChange={(e) => setForm((p) => ({ ...p, target_month: e.target.value }))} placeholder="YYYY-MM" /></label>
              <label className="text-sm">메모<textarea className="crm-field mt-1 min-h-[80px]" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="crm-btn-secondary" onClick={() => setOpen(false)}>취소</button>
              <button type="button" className="crm-btn-primary" onClick={() => void createPrepayment()}>저장</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
