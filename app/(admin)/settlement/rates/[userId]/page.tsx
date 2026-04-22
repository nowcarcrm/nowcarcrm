"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { isSuperAdmin } from "../../../_lib/rolePermissions";
import { supabase } from "../../../_lib/supabaseClient";
import type { MonthlyRate, RateTemplateWithUser } from "../../../_types/settlement";

type ReportRow = { rate_month: string; status: string };

function monthChoices() {
  const out: string[] = [];
  const d = new Date();
  for (let i = -1; i <= 2; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function SettlementRateUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const userId = String(params?.userId ?? "");
  const [template, setTemplate] = useState<RateTemplateWithUser | null>(null);
  const [history, setHistory] = useState<MonthlyRate[]>([]);
  const [confirmedMap, setConfirmedMap] = useState<Record<string, boolean>>({});
  const [applyMonth, setApplyMonth] = useState(monthChoices()[1] ?? "");
  const [saving, setSaving] = useState(false);

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

  async function loadPageData() {
    if (!canView || !userId) return;
    const token = await getToken();
    if (!token) return;

    const [ratesRes, historyRes, reportsRes] = await Promise.all([
      fetch("/api/settlement/rates", { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/settlement/rates/history?user_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/settlement/reports/confirmed-months?user_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const ratesJson = (await ratesRes.json()) as { rows?: RateTemplateWithUser[]; error?: string };
    if (!ratesRes.ok) throw new Error(ratesJson.error ?? "요율 템플릿 조회 실패");
    setTemplate((ratesJson.rows ?? []).find((r) => r.user_id === userId) ?? null);

    const historyJson = (await historyRes.json()) as { rows?: MonthlyRate[]; error?: string };
    if (!historyRes.ok) throw new Error(historyJson.error ?? "월별 이력 조회 실패");
    setHistory(historyJson.rows ?? []);

    if (reportsRes.ok) {
      const reportsJson = (await reportsRes.json()) as { rows?: ReportRow[] };
      const nextMap: Record<string, boolean> = {};
      for (const row of reportsJson.rows ?? []) {
        if (row.status === "confirmed") nextMap[row.rate_month] = true;
      }
      setConfirmedMap(nextMap);
    } else {
      setConfirmedMap({});
    }
  }

  useEffect(() => {
    if (!loading && !canView) {
      router.replace("/dashboard");
      return;
    }
    void loadPageData().catch((e) => {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    });
  }, [loading, canView, userId]);

  if (loading || !profile) {
    return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  }
  if (!canView) {
    return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;
  }
  if (!template) {
    return <div className="py-16 text-center text-sm text-zinc-500">요율 템플릿을 찾을 수 없습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="crm-card p-5 sm:p-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">직원 요율 설정</h1>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-zinc-500">이름</span> <span className="font-semibold">{template.user_name}</span></div>
          <div><span className="text-zinc-500">이메일</span> <span className="font-semibold">{template.user_email || "-"}</span></div>
          <div><span className="text-zinc-500">소속</span> <span className="font-semibold">{[template.user_division_name, template.user_team_name].filter(Boolean).join(" / ") || "팀 무소속"}</span></div>
          <div><span className="text-zinc-500">직급</span> <span className="font-semibold">{template.user_rank || "-"}</span></div>
        </div>
      </header>

      <section className="crm-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">요율 수정</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            기본요율 (%)
            <input
              className="crm-field mt-1"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={template.base_rate}
              onChange={(e) => setTemplate((p) => (p ? { ...p, base_rate: Number(e.target.value) } : p))}
            />
          </label>
          <label className="text-sm">
            인센티브 구간당 (%)
            <input
              className="crm-field mt-1"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={template.incentive_per_tier_percent}
              onChange={(e) =>
                setTemplate((p) => (p ? { ...p, incentive_per_tier_percent: Number(e.target.value) } : p))
              }
            />
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={template.eligible_incentive}
              onChange={(e) => setTemplate((p) => (p ? { ...p, eligible_incentive: e.target.checked } : p))}
            />
            인센티브 대상
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={template.include_sliding}
              onChange={(e) => setTemplate((p) => (p ? { ...p, include_sliding: e.target.checked } : p))}
            />
            슬라이딩 수수료 포함(참고)
          </label>
          <label className="text-sm flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={template.is_excluded}
              onChange={(e) =>
                setTemplate((p) => (p ? { ...p, is_excluded: e.target.checked, base_rate: e.target.checked ? 0 : p.base_rate } : p))
              }
            />
            정산 제외
          </label>
          {template.is_excluded ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
              이 직원은 정산 계산에서 제외됩니다. 본인 정산서도 열람 불가.
            </div>
          ) : null}
          <label className="text-sm sm:col-span-2">
            특수 메모
            <textarea
              className="crm-field mt-1 min-h-[110px]"
              value={template.special_note ?? ""}
              onChange={(e) => setTemplate((p) => (p ? { ...p, special_note: e.target.value } : p))}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="crm-btn-primary"
            disabled={saving}
            onClick={() =>
              void (async () => {
                const baseRate = Number(template.base_rate);
                const incRate = Number(template.incentive_per_tier_percent);
                if (!(baseRate >= 0 && baseRate <= 100)) return toast.error("base_rate는 0.00~100.00 범위여야 합니다.");
                if (!(incRate >= 0 && incRate <= 100)) return toast.error("incentive_per_tier_percent는 0.00~100.00 범위여야 합니다.");
                setSaving(true);
                try {
                  const token = await getToken();
                  if (!token) throw new Error("로그인이 필요합니다.");
                  const res = await fetch(`/api/settlement/rates/${encodeURIComponent(template.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      base_rate: template.is_excluded ? 0 : baseRate,
                      eligible_incentive: template.eligible_incentive,
                      incentive_per_tier_percent: incRate,
                      include_sliding: template.include_sliding,
                      is_excluded: template.is_excluded,
                      special_note: template.special_note ?? null,
                    }),
                  });
                  const json = (await res.json()) as { error?: string };
                  if (!res.ok) throw new Error(json.error ?? "저장 실패");
                  toast.success("저장되었습니다.");
                  await loadPageData();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "저장 실패");
                } finally {
                  setSaving(false);
                }
              })()
            }
          >
            저장
          </button>

          <div className="flex items-center gap-2">
            <select className="crm-field crm-field-select" value={applyMonth} onChange={(e) => setApplyMonth(e.target.value)}>
              {monthChoices().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={!!confirmedMap[applyMonth]}
              onClick={() =>
                void (async () => {
                  if (confirmedMap[applyMonth]) {
                    toast.error("해당 월은 이미 확정되어 적용할 수 없습니다.");
                    return;
                  }
                  try {
                    const token = await getToken();
                    if (!token) throw new Error("로그인이 필요합니다.");
                    const res = await fetch("/api/settlement/rates/apply-to-month", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ rate_month: applyMonth, user_ids: [userId] }),
                    });
                    const json = (await res.json()) as { applied?: number; skipped?: Array<{ reason: string }>; error?: string };
                    if (!res.ok) throw new Error(json.error ?? "월 적용 실패");
                    if ((json.skipped ?? []).length > 0) {
                      toast.error(json.skipped?.[0]?.reason ?? "적용이 차단되었습니다.");
                    } else {
                      toast.success("선택한 월에 적용되었습니다.");
                      await loadPageData();
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "월 적용 실패");
                  }
                })()
              }
            >
              이 설정을 특정 월에 적용
            </button>
          </div>
        </div>
      </section>

      <section className="crm-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">월별 적용 이력</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
                <th className="px-3 py-2">적용월</th>
                <th className="px-3 py-2">기본요율</th>
                <th className="px-3 py-2">인센티브</th>
                <th className="px-3 py-2">정산제외</th>
                <th className="px-3 py-2">적용일시</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2">{h.rate_month}</td>
                  <td className="px-3 py-2">{Number(h.base_rate).toFixed(2)}%</td>
                  <td className="px-3 py-2">{h.eligible_incentive ? "ON" : "OFF"}</td>
                  <td className="px-3 py-2">{h.is_excluded ? "Y" : "N"}</td>
                  <td className="px-3 py-2">{new Date(h.created_at).toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-2">
                    {confirmedMap[h.rate_month] ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">확정됨</span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
