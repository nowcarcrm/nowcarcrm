"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { supabase } from "../../_lib/supabaseClient";
import type { RateTemplateWithUser } from "../../_types/settlement";

type AvailableUser = {
  id: string;
  name: string;
  email: string;
  rank: string;
  team_name: string | null;
};

function formatWonRate(v: number) {
  return `${Number(v ?? 0).toFixed(2)}%`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthChoices() {
  const out: string[] = [];
  const d = new Date();
  for (let i = -1; i <= 2; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function SettlementRatesPage() {
  const { profile, loading } = useAuth();
  const [rows, setRows] = useState<RateTemplateWithUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [createForm, setCreateForm] = useState({
    user_id: "",
    base_rate: 40,
    eligible_incentive: true,
    incentive_per_tier_percent: 5,
    include_sliding: false,
    is_excluded: false,
    special_note: "",
  });

  const canView = useMemo(
    () => (profile ? isSuperAdmin({ email: profile.email, role: profile.role, rank: profile.rank }) : false),
    [profile]
  );

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadRates() {
    if (!canView) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/settlement/rates", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { rows?: RateTemplateWithUser[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "요율 목록 조회 실패");
      setRows(json.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요율 목록 조회 실패");
    } finally {
      setBusy(false);
    }
  }

  async function loadAvailableUsers() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/settlement/rates/available-users", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { rows?: AvailableUser[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? "직원 목록 조회 실패");
    setAvailableUsers(json.rows ?? []);
  }

  async function loadHistory() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/settlement/rates/history", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { rows?: any[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? "이력 조회 실패");
    setHistoryRows(json.rows ?? []);
  }

  useEffect(() => {
    void loadRates();
  }, [canView]);

  if (loading || !profile) {
    return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  }
  if (!canView) {
    return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">요율 관리</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">직원별 정산 요율 템플릿 관리</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="crm-btn-secondary"
              onClick={() => {
                void (async () => {
                  try {
                    await loadAvailableUsers();
                    setShowAddModal(true);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "조회 실패");
                  }
                })();
              }}
            >
              신규 직원 추가
            </button>
            <div className="flex items-center gap-2">
              <select className="crm-field crm-field-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                {monthChoices().map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="crm-btn-primary"
                onClick={() =>
                  void (async () => {
                    try {
                      const token = await getToken();
                      if (!token) throw new Error("로그인이 필요합니다.");
                      const res = await fetch("/api/settlement/rates/apply-to-month", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ rate_month: month }),
                      });
                      const json = (await res.json()) as { applied?: number; skipped?: Array<{ user_name: string }>; error?: string };
                      if (!res.ok) throw new Error(json.error ?? "월별 적용 실패");
                      toast.success(`적용 ${json.applied ?? 0}건, 스킵 ${(json.skipped ?? []).length}건`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "월별 적용 실패");
                    }
                  })()
                }
              >
                이번 달 요율 적용
              </button>
            </div>
            <button
              type="button"
              className="crm-btn-secondary"
              onClick={() =>
                void (async () => {
                  try {
                    await loadHistory();
                    setShowHistoryModal(true);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "이력 조회 실패");
                  }
                })()
              }
            >
              월별 적용 이력 보기
            </button>
          </div>
        </div>
      </header>

      <section className="crm-card p-4 sm:p-5">
        {busy ? (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">소속</th>
                  <th className="px-3 py-2">직급</th>
                  <th className="px-3 py-2">기본요율</th>
                  <th className="px-3 py-2">인센티브</th>
                  <th className="px-3 py-2 text-right">수정</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.user_name}</span>
                        <span className="text-xs text-zinc-500">({r.user_email || "이메일 없음"})</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{[r.user_division_name, r.user_team_name].filter(Boolean).join(" / ") || "팀 무소속"}</td>
                    <td className="px-3 py-2">{r.user_rank || "-"}</td>
                    <td className="px-3 py-2 font-semibold">{formatWonRate(r.base_rate)}</td>
                    <td className="px-3 py-2">
                      {r.eligible_incentive ? `ON (구간당 ${formatWonRate(r.incentive_per_tier_percent)})` : "OFF"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/settlement/rates/${r.user_id}`} className="crm-btn-secondary px-3 py-1.5 text-xs">
                        수정
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddModal ? (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowAddModal(false)} />
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <div className="crm-modal-panel w-full max-w-xl">
              <h2 className="text-lg font-semibold">신규 직원 요율 템플릿 추가</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  대상 직원
                  <select
                    className="crm-field crm-field-select mt-1"
                    value={createForm.user_id}
                    onChange={(e) => setCreateForm((p) => ({ ...p, user_id: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email || "이메일 없음"})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  기본 요율(%)
                  <input
                    className="crm-field mt-1"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={createForm.base_rate}
                    onChange={(e) => setCreateForm((p) => ({ ...p, base_rate: Number(e.target.value) }))}
                  />
                </label>
                <label className="text-sm">
                  인센티브 구간당(%)
                  <input
                    className="crm-field mt-1"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={createForm.incentive_per_tier_percent}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, incentive_per_tier_percent: Number(e.target.value) }))
                    }
                  />
                </label>
                <label className="text-sm flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={createForm.eligible_incentive}
                    onChange={(e) => setCreateForm((p) => ({ ...p, eligible_incentive: e.target.checked }))}
                  />
                  인센티브 대상
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createForm.include_sliding}
                    onChange={(e) => setCreateForm((p) => ({ ...p, include_sliding: e.target.checked }))}
                  />
                  슬라이딩 포함
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createForm.is_excluded}
                    onChange={(e) => setCreateForm((p) => ({ ...p, is_excluded: e.target.checked }))}
                  />
                  정산 제외
                </label>
                <label className="text-sm sm:col-span-2">
                  특수 메모
                  <textarea
                    className="crm-field mt-1 min-h-[90px]"
                    value={createForm.special_note}
                    onChange={(e) => setCreateForm((p) => ({ ...p, special_note: e.target.value }))}
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="crm-btn-secondary" onClick={() => setShowAddModal(false)}>
                  취소
                </button>
                <button
                  type="button"
                  className="crm-btn-primary"
                  onClick={() =>
                    void (async () => {
                      try {
                        const token = await getToken();
                        if (!token) throw new Error("로그인이 필요합니다.");
                        const res = await fetch("/api/settlement/rates", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            ...createForm,
                            special_note: createForm.special_note.trim() || null,
                          }),
                        });
                        const json = (await res.json()) as { error?: string };
                        if (!res.ok) throw new Error(json.error ?? "생성 실패");
                        toast.success("요율 템플릿이 추가되었습니다.");
                        setShowAddModal(false);
                        await loadRates();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "생성 실패");
                      }
                    })()
                  }
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showHistoryModal ? (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowHistoryModal(false)} />
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <div className="crm-modal-panel w-full max-w-4xl">
              <h2 className="text-lg font-semibold">월별 적용 이력</h2>
              <div className="mt-4 max-h-[60vh] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
                      <th className="px-3 py-2">적용월</th>
                      <th className="px-3 py-2">직원</th>
                      <th className="px-3 py-2">기본요율</th>
                      <th className="px-3 py-2">인센티브</th>
                      <th className="px-3 py-2">정산제외</th>
                      <th className="px-3 py-2">적용자</th>
                      <th className="px-3 py-2">적용일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r) => (
                      <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="px-3 py-2">{r.rate_month}</td>
                        <td className="px-3 py-2">{r.user_name} <span className="text-xs text-zinc-500">({r.user_email || "이메일 없음"})</span></td>
                        <td className="px-3 py-2">{formatWonRate(Number(r.base_rate ?? 0))}</td>
                        <td className="px-3 py-2">{r.eligible_incentive ? "ON" : "OFF"}</td>
                        <td className="px-3 py-2">{r.is_excluded ? "Y" : "N"}</td>
                        <td className="px-3 py-2">{r.created_by_name ?? "-"}</td>
                        <td className="px-3 py-2">{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" className="crm-btn-secondary" onClick={() => setShowHistoryModal(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
