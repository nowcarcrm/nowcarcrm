"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { computeDashboardMetrics } from "../_lib/leaseCrmLogic";
import { ensureSeedLeads, loadLeadsFromStorage } from "../_lib/leaseCrmStorage";
import {
  createNotice,
  deleteNotice,
  listNotices,
  updateNotice,
} from "../_lib/leaseCrmSupabase";
import type { Lead, Notice } from "../_lib/leaseCrmTypes";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import type { AuthProfile } from "../_lib/authSupabase";

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("ko-KR").format(n) + "원";
  } catch {
    return `${n}원`;
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      queueMicrotask(() => setLeads([]));
      return;
    }
    let mounted = true;
    (async () => {
      try {
        await ensureSeedLeads();
        const loaded = await loadLeadsFromStorage({
          role: profile.role,
          userId: profile.userId,
        });
        console.log("[DashboardPage] leads loaded", { count: loaded.length });
        if (!mounted) return;
        setLoadError(null);
        window.setTimeout(() => setLeads(loaded), 0);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[DashboardPage] leads load failed(raw)", {
          message: msg,
          raw: e,
          profile,
        });
        setLoadError(msg);
        toast.error("고객 데이터를 불러오지 못했습니다. 콘솔 로그를 확인해 주세요.");
        window.setTimeout(() => setLeads([]), 0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading]);

  const metrics = useMemo(() => {
    if (!leads) return null;
    return computeDashboardMetrics(leads);
  }, [leads]);

  const nowLabel = useMemo(() => {
    const d = new Date();
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  }, []);

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-4 border-b border-[var(--crm-border-strong)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="crm-page-eyebrow">운영 개요</div>
          <h1 className="crm-page-title mt-2">HOME</h1>
          <p className="crm-page-desc">
            오늘 현황과 자동 알림을 한눈에 확인합니다. 지표는 현재 로드된 고객 데이터 기준으로 집계됩니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--crm-border)] bg-[var(--crm-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--crm-accent-muted)] shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            실시간 집계
          </span>
          <span className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-canvas)] px-3 py-1.5 text-[11px] font-medium text-[var(--crm-accent-muted)]">
            기준 시각 {nowLabel}
          </span>
        </div>
      </div>

      {loadError ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          고객 데이터 조회에 실패했습니다. 원인: {loadError}
        </section>
      ) : null}
      {!loadError && leads && leads.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <div className="text-sm font-medium text-slate-700 dark:text-zinc-200">데이터가 없습니다.</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            고객이 아직 등록되지 않았거나 조회 조건에 맞는 항목이 없습니다.
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <Link
            href="/leads/counseling-progress"
            className="text-[13px] font-semibold text-[var(--crm-accent)] underline-offset-4 hover:underline dark:text-slate-100"
          >
            핵심 지표
          </Link>
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-500">당일·당월 성과 · 클릭 시 목록</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
          <MetricCard
            title="오늘 신규"
            hint="신규 디비 유입"
            value={metrics?.todayNewDb ?? "—"}
            loading={!metrics}
            href="/leads/new-db?fromDash=todayNew"
          />
          <MetricCard
            title="오늘 상담 완료"
            hint="상담 마감 건수"
            value={metrics?.todayCounselingCompleted ?? "—"}
            loading={!metrics}
            href="/leads/counseling-progress?fromDash=todayCounseling"
          />
          <MetricCard
            title="계약 진행 중"
            hint="체결·확정 단계"
            value={metrics?.contractInProgress ?? "—"}
            loading={!metrics}
            href="/leads/contract-progress?fromDash=contractPipe"
          />
          <MetricCard
            title="이번 달 계약 완료"
            hint="월간 클로징"
            value={metrics?.thisMonthContractCompleted ?? "—"}
            loading={!metrics}
            href="/leads/contract-progress?fromDash=monthContract"
          />
          <MetricCard
            title="이번 달 예상 수수료"
            hint="계약 기준 추정"
            value={metrics ? formatMoney(metrics.thisMonthExpectedFee) : "—"}
            loading={!metrics}
            emphasize
            href="/leads/contract-progress?fromDash=monthContract"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <Link
            href="/leads/follow-up"
            className="text-[13px] font-semibold text-[var(--crm-accent)] underline-offset-4 hover:underline dark:text-slate-100"
          >
            운영 알림
          </Link>
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-500">조치 구간 · 클릭 시 목록</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          <MetricCard
            title="미처리 디비"
            hint="첫 터치 지연"
            value={metrics?.unprocessedNewDb ?? "—"}
            variant="warning"
            loading={!metrics}
            href="/leads/new-db?fromDash=staleNew"
          />
          <MetricCard
            title="재연락 예정"
            hint="일정 잡힌 리드"
            value={metrics?.followUpPlanned ?? "—"}
            variant="info"
            loading={!metrics}
            href="/leads/follow-up?fromDash=todayFollow"
          />
          <MetricCard
            title="부재 고객"
            hint="연락 미응답"
            value={metrics?.unresponsive ?? "—"}
            variant="danger"
            loading={!metrics}
            href="/leads/unresponsive"
          />
          <MetricCard
            title="출고 진행 중"
            hint="발주~인도 전"
            value={metrics?.exportInProgress ?? "—"}
            variant="success"
            loading={!metrics}
            href="/leads/export-progress"
          />
        </div>
      </section>

      <CompanyNoticesSection profile={profile} />

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
        <section className="crm-card lg:col-span-3">
          <div className="crm-card-header">
            <div>
              <Link
                href="/leads/counseling-progress"
                className="text-[13px] font-semibold text-[var(--crm-accent)] underline-offset-4 hover:underline dark:text-slate-50"
              >
                담당자 실적 · 파이프라인
              </Link>
              <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                신규→상담→재연락→계약·출고 · 출고완료 대비 신규 전환율(참고)
              </div>
            </div>
            <span className="rounded-md bg-[var(--crm-canvas)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--crm-accent-muted)]">
              Team
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <th className="px-3 py-3">담당</th>
                  <th className="px-2 py-3 text-center">신규</th>
                  <th className="px-2 py-3 text-center">상담</th>
                  <th className="px-2 py-3 text-center">재연락</th>
                  <th className="px-2 py-3 text-center">계약진행</th>
                  <th className="px-2 py-3 text-center">계약</th>
                  <th className="px-2 py-3 text-center">출고완료</th>
                  <th className="px-3 py-3 text-right">전환%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                {!metrics ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">
                      표를 불러오는 중…
                    </td>
                  </tr>
                ) : null}
                {metrics
                  ? (metrics.staffPipeline ?? []).map((r) => {
                      const conv =
                        r.newDb > 0 ? Math.round((r.deliveryComplete / r.newDb) * 100) : 0;
                      return (
                        <tr
                          key={r.staff}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-zinc-900/40"
                        >
                          <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                            {r.staff}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                            {r.newDb}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                            {r.counseling}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                            {r.followUp}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                            {r.contractProgress}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                            {r.contractSigned}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                            {r.deliveryComplete}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-[var(--crm-blue)]/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--crm-blue-deep)] dark:bg-sky-500/15 dark:text-sky-200">
                              {conv}%
                            </span>
                            <div className="mt-0.5 text-[9px] font-medium text-slate-400 dark:text-zinc-500">
                              출고/신규
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : null}
                {metrics && (metrics.staffPipeline ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-14 text-center">
                      <div className="text-sm font-medium text-slate-600 dark:text-zinc-300">표시할 직원 데이터가 없습니다</div>
                      <div className="mt-1 text-xs text-slate-400 dark:text-zinc-500">
                        고객에 담당자가 배정되면 이곳에 집계됩니다.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="crm-card lg:col-span-2">
          <div className="crm-card-header">
            <div>
              <Link
                href="/leads/new-db"
                className="text-[13px] font-semibold text-[var(--crm-accent)] underline-offset-4 hover:underline dark:text-slate-50"
              >
                자동 관리 요약
              </Link>
              <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                규칙 기반 알림 · 항목 클릭 시 관련 목록
              </div>
            </div>
          </div>
          <div className="crm-card-body space-y-0 divide-y divide-slate-100 p-0 dark:divide-zinc-800/80">
            <AutoRow
              label="오늘 재연락 예정"
              detail="캘린더·다음 연락일 일치"
              value={metrics?.automation.todayFollowUp ?? "—"}
              loading={!metrics}
              href="/leads/follow-up?fromDash=todayFollow"
            />
            <AutoRow
              label="3일 이상 미처리 신규"
              detail="첫 응대 SLA 초과"
              value={metrics?.automation.unprocessedNewDb ?? "—"}
              loading={!metrics}
              tone="amber"
              href="/leads/new-db?fromDash=staleNew"
            />
            <AutoRow
              label="7일 이상 방치 고객"
              detail="장기 무응답 리스크"
              value={metrics?.automation.abandoned7days ?? "—"}
              loading={!metrics}
              tone="rose"
              href="/leads/counseling-progress?fromDash=stale7"
            />
            <AutoRow
              label="출고 예정 임박 (7일 이내)"
              detail="인도 일정 임박"
              value={metrics?.automation.deliveryDueSoon ?? "—"}
              loading={!metrics}
              tone="amber"
              href="/leads/export-progress?fromDash=deliveryDue"
            />
            <AutoRow
              label="인도 완료 후 3개월 안내"
              detail="사후관리 타깃"
              value={metrics?.automation.afterDelivery3Months ?? "—"}
              loading={!metrics}
              tone="emerald"
              href="/leads/aftercare"
            />
          </div>
          <div className="border-t border-slate-100 px-5 py-3 dark:border-zinc-800/80">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
              자동 관리 수치는 목록·상세 화면의 고객 데이터와 동일한 규칙으로 계산됩니다. 상세 필터는 각
              진행단계 메뉴에서 확인하세요.
            </p>
          </div>
        </section>
      </div>

      <section className="crm-card">
        <div className="crm-card-header">
          <div>
            <Link
              href="/leads/new-db"
              className="text-[13px] font-semibold text-[var(--crm-accent)] underline-offset-4 hover:underline dark:text-slate-50"
            >
              유입경로 성과 분석
            </Link>
            <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              유입별 고객 수·계약 진행·계약 완료·출고 완료 · 출고/유입 전환율(참고)
            </div>
          </div>
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="min-w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <th className="py-3 pl-0 pr-2">유입</th>
                <th className="px-2 py-3 text-center">고객 수</th>
                <th className="px-2 py-3 text-center">계약 진행</th>
                <th className="px-2 py-3 text-center">계약 완료</th>
                <th className="px-2 py-3 text-center">출고 완료</th>
                <th className="py-3 pl-2 pr-0 text-right">출고/유입</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {!metrics ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    불러오는 중…
                  </td>
                </tr>
              ) : null}
              {metrics
                ? (metrics.sourceFunnel ?? []).map((r) => {
                    const conv = r.total > 0 ? Math.round((r.deliveryComplete / r.total) * 100) : 0;
                    return (
                      <tr key={r.source} className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40">
                        <td className="py-2.5 pl-0 pr-2 font-semibold text-slate-900 dark:text-slate-100">
                          {r.source}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-slate-800 dark:text-zinc-100">
                          {r.total}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                          {r.contractProgress}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                          {r.contractSigned}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-slate-700 dark:text-zinc-200">
                          {r.deliveryComplete}
                        </td>
                        <td className="py-2.5 pl-2 pr-0 text-right">
                          <span className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-[var(--crm-blue)]/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--crm-blue-deep)] dark:bg-sky-500/15 dark:text-sky-200">
                            {conv}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatNoticeDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

function CompanyNoticesSection({ profile }: { profile: AuthProfile | null }) {
  const isAdmin = profile?.role === "admin";
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Notice | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listNotices(5);
      setNotices(list);
    } catch (e) {
      setNotices([]);
      toast.error(e instanceof Error ? e.message : "공지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(n: Notice) {
    setEditing(n);
    setFormOpen(true);
  }

  async function handleDelete(n: Notice) {
    if (!isAdmin) return;
    const ok = window.confirm(`「${n.title}」공지를 삭제할까요?`);
    if (!ok) return;
    try {
      await deleteNotice(n.id);
      toast.success("공지를 삭제했습니다.");
      await load();
      if (detail?.id === n.id) setDetail(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <>
      <section className="crm-card border-[var(--crm-border-strong)]/80">
        <div className="crm-card-header">
          <div>
            <div className="text-[13px] font-semibold text-[var(--crm-accent)] dark:text-slate-50">
              회사 공지사항
            </div>
            <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              최신 공지 {loading ? "…" : `${notices.length}건`} 표시 · 전체 내용은 항목 클릭
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={openCreate}
              className="crm-btn-primary shrink-0 py-1.5 text-xs"
            >
              공지 작성
            </button>
          ) : null}
        </div>
        <div className="crm-card-body px-0 py-0">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : notices.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-zinc-400">
              등록된 공지가 없습니다.
              {isAdmin ? (
                <div className="mt-2">
                  <button type="button" onClick={openCreate} className="text-[var(--crm-blue)] underline">
                    첫 공지 작성하기
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {notices.map((n, idx) => (
                <li
                  key={n.id}
                  className={cn(
                    "group relative px-5 py-4 transition-colors hover:bg-slate-50/90 dark:hover:bg-zinc-900/40",
                    idx === 0 && "bg-amber-50/40 ring-1 ring-inset ring-amber-200/60 dark:bg-amber-500/5 dark:ring-amber-500/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setDetail(n)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {idx === 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                            최신
                          </span>
                        ) : null}
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                          {n.title}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-slate-600 dark:text-zinc-300">
                        {n.content}
                      </p>
                      <div className="mt-2 text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                        {formatNoticeDate(n.createdAt)}
                      </div>
                    </button>
                    {isAdmin ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(n);
                          }}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--crm-blue-deep)] hover:bg-[var(--crm-blue)]/10 dark:text-sky-300"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(n);
                          }}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {/* HoverCard: 데스크톱에서 미리보기 */}
                  <div
                    className="pointer-events-none absolute left-5 right-5 top-full z-20 mt-1 hidden max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] leading-relaxed text-slate-700 shadow-lg md:group-hover:block dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                    role="tooltip"
                  >
                    <div className="whitespace-pre-wrap">{n.content}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 dark:border-zinc-800/80">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
            공지 작성·수정·삭제는 관리자만 가능합니다. 매니저·직원은 조회만 됩니다. (향후 고정 공지·읽음
            표시 등 확장 가능)
          </p>
        </div>
      </section>

      {detail ? (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px]"
            onClick={() => setDetail(null)}
            aria-hidden
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="crm-modal-panel max-h-[min(85dvh,640px)] w-full max-w-lg overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal
              aria-labelledby="notice-detail-title"
            >
              <div id="notice-detail-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {detail.title}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatNoticeDate(detail.createdAt)}
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                {detail.content}
              </div>
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={() => setDetail(null)} className="crm-btn-secondary text-xs">
                  닫기
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {formOpen && profile ? (
        <NoticeFormModal
          key={editing?.id ?? "new"}
          initial={editing}
          createdBy={profile.userId}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={async () => {
            toast.success(editing ? "공지를 수정했습니다." : "공지를 등록했습니다.");
            setFormOpen(false);
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function NoticeFormModal({
  initial,
  createdBy,
  onClose,
  onSaved,
}: {
  initial: Notice | null;
  createdBy: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      toast.error("제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateNotice(initial.id, { title: t, content: c });
      } else {
        await createNotice({ title: t, content: c, createdBy });
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="crm-modal-panel w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal
        >
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {initial ? "공지 수정" : "공지 작성"}
          </div>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">제목</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="crm-field w-full"
                placeholder="공지 제목"
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="crm-field w-full resize-y"
                placeholder="공지 내용"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="crm-btn-secondary text-xs" disabled={saving}>
                취소
              </button>
              <button type="submit" className="crm-btn-primary text-xs disabled:opacity-50" disabled={saving}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function MetricCard({
  title,
  hint,
  value,
  variant,
  loading,
  emphasize,
  href,
}: {
  title: string;
  hint?: string;
  value: string | number;
  variant?: "warning" | "info" | "danger" | "success";
  loading?: boolean;
  emphasize?: boolean;
  href: string;
}) {
  const accent =
    variant === "warning"
      ? "bg-amber-500"
      : variant === "info"
        ? "bg-[var(--crm-blue)]"
        : variant === "danger"
          ? "bg-rose-500"
          : variant === "success"
            ? "bg-emerald-600"
            : "bg-[var(--crm-blue-deep)]";

  const inner = (
    <>
      <div className={cn("absolute left-0 top-0 h-full w-1 rounded-r-sm", accent)} aria-hidden />
      <div className="py-4 pl-3 pr-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400">
              {title}
            </div>
            {hint ? (
              <div className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-slate-400 dark:text-zinc-500">
                {hint}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "mt-3 tabular-nums tracking-tight text-slate-900 dark:text-slate-50",
            emphasize ? "text-2xl font-bold sm:text-[1.75rem]" : "text-xl font-bold sm:text-2xl"
          )}
        >
          {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-zinc-800" /> : value}
        </div>
      </div>
    </>
  );

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-slate-200/95 bg-white pl-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-950",
        emphasize && "ring-1 ring-[var(--crm-blue)]/20 dark:ring-[var(--crm-blue)]/25"
      )}
    >
      {inner}
    </Link>
  );
}

function AutoRow({
  label,
  detail,
  value,
  loading,
  tone,
  href,
}: {
  label: string;
  detail: string;
  value: string | number;
  loading?: boolean;
  tone?: "amber" | "rose" | "emerald";
  href: string;
}) {
  const dot =
    tone === "amber"
      ? "bg-amber-400"
      : tone === "rose"
        ? "bg-rose-400"
        : tone === "emerald"
          ? "bg-emerald-400"
          : "bg-slate-300 dark:bg-zinc-600";

  return (
    <Link
      href={href}
      className="flex items-start gap-3 px-5 py-4 transition-colors duration-150 hover:bg-slate-50/90 dark:hover:bg-zinc-900/55"
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{label}</div>
        <div className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">{detail}</div>
      </div>
      <div className="shrink-0 text-right">
        {loading ? (
          <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-slate-100 dark:bg-zinc-800" />
        ) : (
          <span className="tabular-nums text-lg font-bold text-slate-900 dark:text-slate-50">{value}</span>
        )}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">건</div>
      </div>
    </Link>
  );
}
