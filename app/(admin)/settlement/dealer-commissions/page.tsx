"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../../_lib/supabaseClient";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { MonthNavigator } from "@/app/_components/settlement/MonthNavigator";

type MatchResult = {
  parsed: {
    customer_name?: string;
    car_model?: string;
    owner_name?: string;
    dealer_commission?: number;
    contract_no?: string;
    confidence: number;
  };
  match_tier: 1 | 2 | 3 | 4 | 0;
  confidence: number;
  delivery_id?: string;
  delivery_summary?: string;
  match_reason?: string;
};

type Candidate = {
  id: string;
  customer_name: string;
  car_model: string;
  owner_name: string;
  car_price: number;
  delivery_date: string;
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function confidenceBadge(confidence: number) {
  if (confidence >= 100) return "🟢";
  if (confidence >= 80) return "🟡";
  if (confidence >= 60) return "🟠";
  return "🔴";
}

export default function DealerCommissionsPage() {
  const { profile, loading } = useAuth();
  const [uploadId, setUploadId] = useState("");
  const [rows, setRows] = useState<MatchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, { checked: boolean; amount: number; month: string }>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRowIdx, setManualRowIdx] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualCandidates, setManualCandidates] = useState<Candidate[]>([]);

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

  async function upload(file: File) {
    setBusy(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settlement/dealer-commissions/parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = (await res.json()) as { upload_id?: string; match_results?: MatchResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "파싱 실패");
      const matched = json.match_results ?? [];
      setUploadId(json.upload_id ?? "");
      setRows(matched);
      const next: Record<string, { checked: boolean; amount: number; month: string }> = {};
      for (const m of matched) {
        if (!m.delivery_id) continue;
        next[m.delivery_id] = {
          checked: m.confidence >= 100,
          amount: Math.round(Number(m.parsed.dealer_commission ?? 0)),
          month: monthNow(),
        };
      }
      setDecisions(next);
      toast.success("파싱 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파싱 실패");
    } finally {
      setBusy(false);
    }
  }

  async function applySelected() {
    setBusy(true);
    try {
      const token = await getToken();
      const decisionsPayload = Object.entries(decisions)
        .filter(([, v]) => v.checked)
        .map(([delivery_id, v]) => ({
          delivery_id,
          dealer_commission: Math.round(Number(v.amount ?? 0)),
          dealer_settlement_month: v.month,
        }));
      const res = await fetch("/api/settlement/dealer-commissions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upload_id: uploadId, decisions: decisionsPayload }),
      });
      const json = (await res.json()) as { applied?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "적용 실패");
      toast.success(`적용 완료: ${json.applied ?? 0}건`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "적용 실패");
    } finally {
      setBusy(false);
    }
  }

  async function searchCandidates() {
    const token = await getToken();
    const res = await fetch(`/api/settlement/dealer-commissions/candidates?q=${encodeURIComponent(manualQuery)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { candidates?: Candidate[] };
    if (res.ok) setManualCandidates(json.candidates ?? []);
  }

  function openManualPicker(idx: number) {
    setManualRowIdx(idx);
    setManualQuery("");
    setManualCandidates([]);
    setManualOpen(true);
  }

  function assignManualCandidate(candidate: Candidate) {
    if (manualRowIdx == null) return;
    const row = rows[manualRowIdx];
    if (!row) return;
    const nextRows = [...rows];
    nextRows[manualRowIdx] = {
      ...row,
      delivery_id: candidate.id,
      delivery_summary: `${candidate.customer_name} / ${candidate.car_model} / ${candidate.owner_name}`,
      match_reason: "manual",
      match_tier: 0,
    };
    setRows(nextRows);
    setDecisions((p) => ({
      ...p,
      [candidate.id]: {
        checked: true,
        amount: Math.round(Number(row.parsed.dealer_commission ?? 0)),
        month: monthNow(),
      },
    }));
    setManualOpen(false);
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!canManage) return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">대리점 수당 입력 (AI 매칭)</h1>
          <MonthNavigator currentMonth={monthNow()} />
        </div>
      </header>
      <section className="crm-card p-5">
        <input
          type="file"
          accept=".xlsx,.xls,.jpg,.jpeg,.png"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="mt-2 text-xs text-zinc-500">신뢰도: 🟢100 / 🟡80-99 / 🟠60-79 / 🔴60미만</div>
      </section>

      {rows.length > 0 ? (
        <section className="crm-card p-5">
          <div className="space-y-3">
            {rows.map((r, idx) => {
              const id = r.delivery_id ?? `nomatch-${idx}`;
              const current = decisions[r.delivery_id ?? ""] ?? { checked: false, amount: Math.round(Number(r.parsed.dealer_commission ?? 0)), month: monthNow() };
              return (
                <div key={id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700">
                  <div className="font-medium">
                    {confidenceBadge(r.confidence)} {r.parsed.customer_name ?? "?"} / {r.parsed.car_model ?? "?"} / {r.parsed.owner_name ?? "?"} → {Math.round(r.confidence)}%
                  </div>
                  <div className="mt-1 text-zinc-600 dark:text-zinc-300">AI 추출: {(r.parsed.dealer_commission ?? 0).toLocaleString("ko-KR")}원 / 계약 {r.parsed.contract_no ?? "-"}</div>
                  <div className="mt-1 text-zinc-600 dark:text-zinc-300">매칭: {r.delivery_summary ?? "실패"} ({r.match_reason ?? "-"})</div>
                  {r.delivery_id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={current.checked}
                          onChange={(e) =>
                            setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? current), checked: e.target.checked } }))
                          }
                        />
                        적용
                      </label>
                      <input
                        className="crm-field w-40"
                        value={current.amount}
                        onChange={(e) =>
                          setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? current), amount: Math.round(Number(e.target.value || 0)) } }))
                        }
                      />
                      <input
                        className="crm-field w-28"
                        value={current.month}
                        onChange={(e) =>
                          setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? current), month: e.target.value } }))
                        }
                        placeholder="YYYY-MM"
                      />
                      <button type="button" className="crm-btn-secondary" onClick={() => openManualPicker(idx)}>
                        수동 선택
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="crm-btn-secondary mt-2" onClick={() => openManualPicker(idx)}>
                      수동 선택
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="crm-btn-primary mt-4" disabled={busy} onClick={() => void applySelected()}>
            선택한 건 일괄 적용
          </button>
        </section>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">수동 매칭</h2>
            <div className="mt-3 flex gap-2">
              <input className="crm-field flex-1" placeholder="고객명/차종 검색" value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} />
              <button type="button" className="crm-btn-secondary" onClick={() => void searchCandidates()}>
                검색
              </button>
            </div>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
              {manualCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => assignManualCandidate(c)}
                  className="w-full rounded-lg border border-zinc-200 p-3 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {c.customer_name} / {c.car_model} / {c.owner_name} / {Math.round(Number(c.car_price ?? 0)).toLocaleString("ko-KR")} / {c.delivery_date}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" className="crm-btn-secondary" onClick={() => setManualOpen(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
