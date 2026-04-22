"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { CurrencyInput } from "@/app/_components/settlement/CurrencyInput";
import { MonthNavigator } from "@/app/_components/settlement/MonthNavigator";
import { formatCurrency } from "../../../_lib/settlement/formatters";
import { getDeliveryScope, isDirector, isTeamLeader } from "../../../_lib/settlement/permissions";
import { isSuperAdmin } from "../../../_lib/rolePermissions";
import { supabase } from "../../../_lib/supabaseClient";
import type { Adjustment, DeliveryWithNames, Dispute, MonthlyReportWithUser } from "../../../_types/settlement";

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SettlementReportDetailPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const userId = String(params?.userId ?? "");
  const month = (searchParams?.get("month") ?? monthNow()).trim();

  const [report, setReport] = useState<MonthlyReportWithUser | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryWithNames[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustRelatedMonth, setAdjustRelatedMonth] = useState("");
  const [actionBusy, setActionBusy] = useState<"" | "compute" | "adjust">("");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [newDispute, setNewDispute] = useState("");
  const [respondingId, setRespondingId] = useState("");
  const [responseText, setResponseText] = useState("");
  const [responseStatus, setResponseStatus] = useState<"resolved" | "rejected">("resolved");

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

  const showIncentiveSection = useMemo(() => {
    if (!profile) return false;
    if (profile.userId === userId) return false;
    return canManage || isDirector(profile) || isTeamLeader(profile);
  }, [profile, userId, canManage]);

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function downloadExcel() {
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/reports/${encodeURIComponent(userId)}/export?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "엑셀 다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `정산서_${report?.user_name ?? "직원"}_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "엑셀 다운로드 실패");
    }
  }

  async function downloadPDF() {
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/reports/${encodeURIComponent(userId)}/export-pdf?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "PDF 다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `정산서_${report?.user_name ?? "직원"}_${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 다운로드 실패");
    }
  }

  useEffect(() => {
    if (loading || !profile) return;
    if (scope.scope === "own" && scope.user_id !== userId) {
      router.replace("/dashboard");
    }
  }, [loading, profile, scope, userId, router]);

  async function loadPage() {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;

      const authProbe = await fetch(
        `/api/settlement/reports/preview?user_id=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (authProbe.status === 403) {
        router.replace("/dashboard");
        return;
      }

      const reportRes = await fetch(`/api/settlement/reports?month=${encodeURIComponent(month)}&user_id=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reportJson = (await reportRes.json()) as { rows?: MonthlyReportWithUser[]; error?: string };
      if (!reportRes.ok) throw new Error(reportJson.error ?? "정산 리포트 조회 실패");
      const found = (reportJson.rows ?? [])[0] ?? null;
      setReport(found);

      const deliveryRes = await fetch(
        `/api/settlement/deliveries?month=${encodeURIComponent(month)}&owner_id=${encodeURIComponent(userId)}&status=approved_director,modilca_submitted,confirmed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const deliveryJson = (await deliveryRes.json()) as { deliveries?: DeliveryWithNames[]; error?: string };
      if (deliveryRes.ok) setDeliveries(deliveryJson.deliveries ?? []);

      if (found?.id) {
        const adjRes = await fetch(`/api/settlement/reports/by-report/${found.id}/adjustments`, { headers: { Authorization: `Bearer ${token}` } });
        const adjJson = (await adjRes.json()) as { rows?: Adjustment[] };
        if (adjRes.ok) setAdjustments(adjJson.rows ?? []);
        const disRes = await fetch(`/api/settlement/disputes?report_id=${encodeURIComponent(found.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const disJson = (await disRes.json()) as { rows?: Dispute[] };
        if (disRes.ok) setDisputes(disJson.rows ?? []);
      } else {
        setAdjustments([]);
        setDisputes([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && profile) {
      void loadPage();
    }
  }, [loading, profile, month, userId]);

  async function recomputeSingle() {
    setActionBusy("compute");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch("/api/settlement/reports/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, month }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "재계산 실패");
      toast.success("재계산 완료");
      await loadPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "재계산 실패");
    } finally {
      setActionBusy("");
    }
  }

  async function addAdjustment() {
    if (!report) return;
    setActionBusy("adjust");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/reports/by-report/${report.id}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: Math.round(adjustAmount),
          reason: adjustReason.trim(),
          related_month: adjustRelatedMonth.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "조정 항목 추가 실패");
      toast.success("조정 항목이 반영되었습니다.");
      setAdding(false);
      setAdjustAmount(0);
      setAdjustReason("");
      setAdjustRelatedMonth("");
      await loadPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조정 항목 추가 실패");
    } finally {
      setActionBusy("");
    }
  }

  async function submitDispute() {
    if (!report) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/settlement/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ report_id: report.id, content: newDispute.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "이의 제기 등록 실패");
      setNewDispute("");
      toast.success("이의 제기가 등록되었습니다.");
      await loadPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이의 제기 등록 실패");
    }
  }

  async function respondDispute(disputeId: string) {
    try {
      const token = await getToken();
      const res = await fetch(`/api/settlement/disputes/${disputeId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ response: responseText.trim(), status: responseStatus }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "답변 등록 실패");
      setRespondingId("");
      setResponseText("");
      toast.success("답변이 등록되었습니다.");
      await loadPage();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "답변 등록 실패");
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/settlement/reports?month=${month}`} className="text-sm text-zinc-600 hover:underline">
            ← 월별 정산으로
          </Link>
          <MonthNavigator currentMonth={month} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {(report?.user_name ?? "직원")} ({report?.user_team_name ?? "-"} {report?.user_rank ?? "-"}) - {month} 정산서
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" className="crm-btn-secondary" onClick={() => void downloadExcel()}>
              📥 엑셀 다운로드
            </button>
            <button type="button" className="crm-btn-secondary" onClick={() => void downloadPDF()}>
              📄 PDF
            </button>
            {canManage ? (
              <button
                type="button"
                className="crm-btn-primary"
                disabled={report?.status === "confirmed" || actionBusy !== ""}
                onClick={() => void recomputeSingle()}
              >
                {actionBusy === "compute" ? "재계산 중…" : "재계산"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {busy ? (
        <section className="crm-card p-8 text-center text-sm text-zinc-500">불러오는 중…</section>
      ) : !report ? (
        <section className="crm-card p-8 text-center text-sm text-zinc-500">
          이 직원의 정산이 아직 계산되지 않았습니다.
          {canManage ? " [재계산] 버튼을 눌러주세요." : ""}
        </section>
      ) : (
        <>
          <section className="crm-card p-5 sm:p-6">
            <div className="text-sm text-zinc-500">최종 지급액</div>
            <div className="mt-2 text-4xl font-extrabold text-indigo-700 dark:text-indigo-300">{formatCurrency(report.final_amount)}</div>
            <div className="text-xs text-zinc-500">세금계산서 발행 금액</div>
            <div className="mt-3">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">{report.status}</span>
            </div>
          </section>

          <section className="crm-card p-5 sm:p-6">
            <h2 className="text-base font-semibold">수익 집계</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between"><span>AG 수수료 합</span><span>{formatCurrency(report.total_ag_commission)}</span></div>
              <div className="flex justify-between"><span>대리점 수당 합</span><span>{formatCurrency(report.total_dealer_commission)}</span></div>
              <div className="flex justify-between"><span>기타 수익</span><span>{formatCurrency(report.total_etc_revenue)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>총 수익</span><span>{formatCurrency(report.total_revenue)}</span></div>
              <div className="flex justify-between"><span>고객 지원금 전체</span><span>{formatCurrency(report.total_customer_support)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>순 수익</span><span>{formatCurrency(report.net_revenue)}</span></div>
            </div>
          </section>

          {showIncentiveSection ? (
            <section className="crm-card p-5 sm:p-6">
              <h2 className="text-base font-semibold">인센티브 판정</h2>
              <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                <div>인센티브 대상: {report.eligible_incentive ? "✓" : "✗"}</div>
                <div>순수익 {formatCurrency(report.net_revenue)} → {report.incentive_tier}구간 → +{report.incentive_rate}%</div>
              </div>
            </section>
          ) : null}

          <section className="crm-card p-5 sm:p-6">
            <h2 className="text-base font-semibold">지급액 계산</h2>
            <div className="mt-3 grid gap-2 text-sm">
              <div>기본요율: {report.base_rate}% + 인센티브 {report.incentive_rate}%</div>
              <div className="flex justify-between"><span>요율 수당</span><span>{formatCurrency(report.rate_based_amount)}</span></div>
              <div className="flex justify-between"><span>지원금 50% (부가세 포함)</span><span>{formatCurrency(report.support_50_amount)}</span></div>
              <div className="flex justify-between"><span>조정 항목</span><span>{formatCurrency(report.adjustment_amount)}</span></div>
              <div className="flex justify-between"><span>선지급 차감</span><span>-{formatCurrency(report.prepayment_amount ?? 0)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>최종 지급액</span><span>{formatCurrency(report.final_amount)}</span></div>
            </div>
          </section>

          <section className="crm-card p-5 sm:p-6">
            <h2 className="text-base font-semibold">반영된 출고 건</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
                    <th className="px-3 py-2">인도일</th>
                    <th className="px-3 py-2">고객명</th>
                    <th className="px-3 py-2">차종</th>
                    <th className="px-3 py-2">차량가</th>
                    <th className="px-3 py-2">AG수수료</th>
                    <th className="px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                        반영된 출고 건이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr
                        key={d.id}
                        className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                        onClick={() => router.push(`/settlement/deliveries/${d.id}`)}
                      >
                        <td className="px-3 py-2">{d.delivery_date}</td>
                        <td className="px-3 py-2">{d.customer_name}</td>
                        <td className="px-3 py-2">{d.car_model}</td>
                        <td className="px-3 py-2">{formatCurrency(d.car_price)}</td>
                        <td className="px-3 py-2">{formatCurrency(d.ag_commission)}</td>
                        <td className="px-3 py-2">{d.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="crm-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">조정 항목</h2>
              {canManage ? (
                <button
                  type="button"
                  className="crm-btn-secondary"
                  disabled={report.status === "confirmed"}
                  onClick={() => setAdding((v) => !v)}
                >
                  + 조정 추가
                </button>
              ) : null}
            </div>

            {adding && canManage ? (
              <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <label className="text-sm">
                  금액
                  <CurrencyInput value={adjustAmount} onChange={setAdjustAmount} allowNegative />
                </label>
                <label className="text-sm">
                  사유
                  <textarea
                    className="crm-field mt-1 min-h-[88px]"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  관련월
                  <input
                    className="crm-field mt-1"
                    value={adjustRelatedMonth}
                    onChange={(e) => setAdjustRelatedMonth(e.target.value)}
                    placeholder="예: 2026-03"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" className="crm-btn-secondary" onClick={() => setAdding(false)}>
                    취소
                  </button>
                  <button type="button" className="crm-btn-primary" disabled={actionBusy !== ""} onClick={() => void addAdjustment()}>
                    {actionBusy === "adjust" ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {adjustments.length === 0 ? (
                <div className="text-sm text-zinc-500">현재 조정 없음</div>
              ) : (
                adjustments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                    <div className="font-medium">{formatCurrency(a.amount)}</div>
                    <div className="text-zinc-600 dark:text-zinc-300">{a.reason}</div>
                    <div className="text-xs text-zinc-500">{new Date(a.created_at).toLocaleString("ko-KR")}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="crm-card p-5 sm:p-6">
            <h2 className="text-base font-semibold">이의 제기</h2>
            {!canManage && profile.userId === userId ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="crm-field min-h-[88px]"
                  value={newDispute}
                  onChange={(e) => setNewDispute(e.target.value)}
                  maxLength={500}
                  placeholder="이의 제기 내용을 입력하세요. (최대 500자)"
                />
                <div className="flex justify-end">
                  <button type="button" className="crm-btn-primary" onClick={() => void submitDispute()}>
                    + 새 이의 제기
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {disputes.length === 0 ? (
                <div className="text-sm text-zinc-500">등록된 이의 제기가 없습니다.</div>
              ) : (
                disputes.map((d) => (
                  <div key={d.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                    <div className="font-medium">{new Date(d.created_at).toLocaleDateString("ko-KR")} - {d.status}</div>
                    <div className="mt-1">{d.content}</div>
                    {d.response ? <div className="mt-2 text-zinc-600 dark:text-zinc-300">→ 답변: {d.response}</div> : null}
                    {canManage && d.status === "pending" ? (
                      <div className="mt-2 space-y-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
                        <select className="crm-field w-36" value={responseStatus} onChange={(e) => setResponseStatus(e.target.value as "resolved" | "rejected")}>
                          <option value="resolved">resolved</option>
                          <option value="rejected">rejected</option>
                        </select>
                        <textarea className="crm-field min-h-[72px]" value={respondingId === d.id ? responseText : ""} onChange={(e) => { setRespondingId(d.id); setResponseText(e.target.value); }} />
                        <button type="button" className="crm-btn-secondary" onClick={() => void respondDispute(d.id)}>
                          답변 작성
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
