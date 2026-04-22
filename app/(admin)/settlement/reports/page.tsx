"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { MonthNavigator } from "@/app/_components/settlement/MonthNavigator";
import { formatCurrency } from "../../_lib/settlement/formatters";
import { getDeliveryScope } from "../../_lib/settlement/permissions";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { supabase } from "../../_lib/supabaseClient";
import type { MonthlyReportWithUser } from "../../_types/settlement";

type ReportStatus = "draft" | "confirmed" | "paid";

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const REPORT_STATUS_LABELS: Record<ReportStatus, { label: string; color: string }> = {
  draft: { label: "초안", color: "bg-zinc-200 text-zinc-700" },
  confirmed: { label: "확정", color: "bg-emerald-100 text-emerald-700" },
  paid: { label: "지급완료", color: "bg-sky-100 text-sky-700" },
};

export default function SettlementReportsPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = (searchParams?.get("month") ?? monthNow()).trim();
  const [rows, setRows] = useState<MonthlyReportWithUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<"" | "compute-all" | "confirm-month">("");

  const scope = useMemo(
    () =>
      profile
        ? getDeliveryScope({
            id: profile.userId,
            role: profile.role,
            rank: profile.rank,
            team_name: profile.teamName,
            email: profile.email,
          })
        : { scope: "own" as const, user_id: "" },
    [profile]
  );

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

  async function loadReports() {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const sp = new URLSearchParams();
      sp.set("month", month);
      const res = await fetch(`/api/settlement/reports?${sp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { rows?: MonthlyReportWithUser[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "정산 리포트 조회 실패");
      setRows(json.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && profile && scope.scope === "own") {
      router.replace(`/settlement/my-report?month=${month}`);
    }
  }, [loading, profile, scope.scope, router, month]);

  useEffect(() => {
    if (!loading && profile && scope.scope !== "own") {
      void loadReports();
    }
  }, [loading, profile, scope.scope, month]);

  const totals = useMemo(() => {
    const totalRevenue = rows.reduce((sum, r) => sum + Math.round(Number(r.total_revenue ?? 0)), 0);
    const totalFinal = rows.reduce((sum, r) => sum + Math.round(Number(r.final_amount ?? 0)), 0);
    const status: ReportStatus = rows.length > 0 && rows.every((r) => r.status === "confirmed") ? "confirmed" : "draft";
    return { count: rows.length, totalRevenue, totalFinal, status };
  }, [rows]);

  async function runComputeAll() {
    setActionBusy("compute-all");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch("/api/settlement/reports/compute-all", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month }),
      });
      const json = (await res.json()) as { success?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "전체 재계산 실패");
      toast.success(`재계산 완료: 성공 ${json.success ?? 0}, 실패 ${json.failed ?? 0}`);
      await loadReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "전체 재계산 실패");
    } finally {
      setActionBusy("");
    }
  }

  async function runConfirmMonth() {
    setActionBusy("confirm-month");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch("/api/settlement/reports/confirm-month", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month }),
      });
      const json = (await res.json()) as { confirmed_count?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "월 확정 실패");
      toast.success(`${json.confirmed_count ?? 0}건 확정되었습니다.`);
      await loadReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "월 확정 실패");
    } finally {
      setActionBusy("");
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (scope.scope === "own") return <div className="py-16 text-center text-sm text-zinc-500">내 정산서로 이동 중…</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">월별 정산</h1>
          <MonthNavigator currentMonth={month} />
        </div>
        {canManage ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="crm-btn-primary"
              disabled={totals.status === "confirmed" || actionBusy !== ""}
              onClick={() => {
                if (!confirm("이번 달 전체 직원의 정산을 재계산합니다.")) return;
                void runComputeAll();
              }}
            >
              {actionBusy === "compute-all" ? "재계산 중…" : "전체 재계산"}
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={totals.status === "confirmed" || actionBusy !== ""}
              onClick={() => {
                if (
                  !confirm(
                    `${month} 월 정산을 확정합니다.\n확정 후에는 재계산이 차단되며, 재오픈은 본부장 이상만 가능합니다.\n진행하시겠습니까?`
                  )
                )
                  return;
                void runConfirmMonth();
              }}
            >
              {actionBusy === "confirm-month" ? "확정 처리 중…" : "이 월 확정"}
            </button>
          </div>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="crm-card p-4">
          <div className="text-xs text-zinc-500">대상 직원</div>
          <div className="mt-1 text-2xl font-bold">{totals.count}명</div>
        </article>
        <article className="crm-card p-4">
          <div className="text-xs text-zinc-500">총 수익</div>
          <div className="mt-1 text-2xl font-bold">{formatCurrency(totals.totalRevenue)}</div>
        </article>
        <article className="crm-card p-4">
          <div className="text-xs text-zinc-500">총 지급</div>
          <div className="mt-1 text-2xl font-bold">{formatCurrency(totals.totalFinal)}</div>
        </article>
        <article className="crm-card p-4">
          <div className="text-xs text-zinc-500">확정 상태</div>
          <div className="mt-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${REPORT_STATUS_LABELS[totals.status].color}`}>
              {REPORT_STATUS_LABELS[totals.status].label}
            </span>
          </div>
        </article>
      </section>

      <section className="crm-card p-5">
        {busy ? (
          <div className="py-6 text-center text-sm text-zinc-500">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            {canManage
              ? "아직 이 월의 정산 데이터가 없습니다. [전체 재계산] 버튼을 눌러 계산을 시작하세요."
              : "이 월의 정산은 아직 준비되지 않았습니다. 관리자에게 문의하세요."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">팀</th>
                  <th className="px-3 py-2">직급</th>
                  <th className="px-3 py-2">총수익</th>
                  <th className="px-3 py-2">순수익</th>
                  <th className="px-3 py-2">인센</th>
                  <th className="px-3 py-2">요율수당</th>
                  <th className="px-3 py-2">지원금50</th>
                  <th className="px-3 py-2">조정</th>
                  <th className="px-3 py-2">최종지급</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.user_name}</div>
                      <div className="text-xs text-zinc-500">({r.user_email || "이메일 없음"})</div>
                    </td>
                    <td className="px-3 py-2">{r.user_team_name || "-"}</td>
                    <td className="px-3 py-2">{r.user_rank || "-"}</td>
                    <td className="px-3 py-2">{formatCurrency(r.total_revenue)}</td>
                    <td className="px-3 py-2">{formatCurrency(r.net_revenue)}</td>
                    <td className="px-3 py-2">+{Math.round(Number(r.incentive_rate ?? 0))}%</td>
                    <td className="px-3 py-2">{formatCurrency(r.rate_based_amount)}</td>
                    <td className="px-3 py-2">{formatCurrency(r.support_50_amount)}</td>
                    <td className={`px-3 py-2 ${Number(r.adjustment_amount) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatCurrency(r.adjustment_amount)}
                    </td>
                    <td className="px-3 py-2 font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(r.final_amount)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${REPORT_STATUS_LABELS[r.status].color}`}>
                        {REPORT_STATUS_LABELS[r.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/settlement/reports/${r.user_id}?month=${month}`} className="crm-btn-secondary px-3 py-1.5 text-xs">
                        상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
