"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { motion, useReducedMotion } from "framer-motion";
import { dashboardPageStagger, dashboardSectionItem } from "@/app/_lib/crmMotion";
import {
  computeDashboardMetrics,
  computePipelineStageCounts,
  pickRecentCounselingLeads,
  pickRecentLeads,
  pickTodayContactLeads,
} from "../_lib/leaseCrmLogic";
import { ensureSeedLeads, loadLeadsFromStorage } from "../_lib/leaseCrmStorage";
import type { Lead } from "../_lib/leaseCrmTypes";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import DashboardKpiCards, { type DashboardKpiValues } from "./_components/DashboardKpiCards";
import DashboardNoticesPreview from "./_components/DashboardNoticesPreview";
import DashboardTodoSection from "./_components/DashboardTodoSection";
import { useLeadDetailModal } from "@/app/_components/admin/AdminShell";
import { getRankBadgeMeta, normalizeRank } from "../_lib/rankConfig";
import UserRankCard from "@/app/_components/ui/UserRankCard";
import { listActiveUsers } from "../_lib/usersSupabase";
import {
  getPersonalPipelineScope,
  getTeamVisibleUserIds,
  isTeamLeader,
} from "../_lib/screenScopes";

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const { openLeadById } = useLeadDetailModal();
  const reduceMotion = useReducedMotion();
  const reduce = !!reduceMotion;
  const dashStagger = dashboardPageStagger(reduce);
  const dashItem = dashboardSectionItem(reduce);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [teamScopedLeads, setTeamScopedLeads] = useState<Lead[] | null>(null);
  const [teamVisibleUserIds, setTeamVisibleUserIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      queueMicrotask(() => setLeads([]));
      queueMicrotask(() => setTeamScopedLeads([]));
      return;
    }
    let mounted = true;
    (async () => {
      try {
        await ensureSeedLeads();
        const viewer = {
          id: profile.userId,
          role: profile.role,
          rank: profile.rank,
          team_name: profile.teamName,
          name: profile.name,
        };
        const users = await listActiveUsers();
        const teamIds = getTeamVisibleUserIds(viewer, users);
        const personalIds = getPersonalPipelineScope(viewer) === "self" ? [profile.userId] : [profile.userId];
        const loaded = await loadLeadsFromStorage({
          role: profile.role,
          userId: profile.userId,
          visibleUserIds: personalIds,
        });
        const loadedTeam = teamIds.length
          ? await loadLeadsFromStorage({
              role: profile.role,
              userId: profile.userId,
              visibleUserIds: teamIds,
            })
          : [];
        if (!mounted) return;
        console.log("[dashboard scope]", {
          currentUserRole: profile.role,
          currentUserRank: profile.rank,
          currentUserTeamName: profile.teamName,
          isTeamLeader: isTeamLeader(viewer),
          teamVisibleUserIdsCount: teamIds.length,
          teamVisibleUserIds: teamIds,
          personalManagerFilter: profile.userId,
        });
        setLoadError(null);
        setTeamVisibleUserIds(teamIds);
        setTeamScopedLeads(loadedTeam);
        window.setTimeout(() => setLeads(loaded), 0);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[DashboardPage] leads load failed", { message: msg, raw: e, profile });
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

  const pipeline = useMemo(() => {
    if (!leads) return null;
    return computePipelineStageCounts(leads);
  }, [leads]);

  const kpiValues = useMemo((): DashboardKpiValues | null => {
    if (!leads || !metrics) return null;
    return {
      thisMonthSalesRevenueWon: metrics.thisMonthSalesRevenueWon,
      thisMonthRegisteredCount: metrics.thisMonthRegisteredCount,
      assignedCustomerCount: leads.length,
    };
  }, [leads, metrics]);

  useEffect(() => {
    if (!leads || !metrics) return;
    const now = new Date();
    const dateRange = {
      from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      to: now.toISOString().slice(0, 10),
    };
    const statusFilter = {
      salesRevenue: "계약 파이프라인 + contract_date 이번달 매출수익",
    };
    const sumColumn = {
      salesRevenue: "contract(수수료+대리점수당-지원비)",
    };
    console.log("dashboard commission query params:", { dateRange, statusFilter, sumColumn });
    console.log("dashboard commission result:", {
      thisMonthSalesRevenueWon: metrics.thisMonthSalesRevenueWon,
      thisMonthRegisteredCount: metrics.thisMonthRegisteredCount,
      leadCount: leads.length,
    });
  }, [leads, metrics]);

  const todayContactLeads = useMemo(() => {
    if (!leads) return [];
    return pickTodayContactLeads(leads, 6);
  }, [leads]);

  const recentAddedForTodo = useMemo(() => {
    if (!leads) return [];
    return pickRecentLeads(leads, 6);
  }, [leads]);

  const recentCounselingLeads = useMemo(() => {
    if (!leads) return [];
    return pickRecentCounselingLeads(leads, 6);
  }, [leads]);

  const dataLoading = leads === null;
  const isAdminTeamLeader = isTeamLeader({
    id: profile?.userId,
    role: profile?.role,
    rank: profile?.rank,
    team_name: profile?.teamName,
    name: profile?.name,
  });
  const teamLeads = useMemo(() => {
    if (!isAdminTeamLeader || !teamScopedLeads) return [];
    return teamScopedLeads;
  }, [isAdminTeamLeader, teamScopedLeads]);
  const teamMetrics = useMemo(() => {
    if (!teamLeads.length) return null;
    return computeDashboardMetrics(teamLeads);
  }, [teamLeads]);
  const rankLabel = normalizeRank(profile?.rank) ?? null;
  const rankMeta = getRankBadgeMeta(profile?.rank);

  const openLead = useCallback(
    async (id: string) => {
      await openLeadById(id);
    },
    [openLeadById]
  );

  return (
    <motion.div
      className="space-y-12 rounded-[30px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(233,241,252,0.7))] p-4 pb-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-sm sm:p-6 lg:p-8 dark:border-zinc-800/80 dark:bg-zinc-950"
      variants={dashStagger}
      initial="hidden"
      animate="show"
    >
      <motion.section
        variants={dashItem}
        className="crm-card rounded-[28px] px-6 py-7 sm:px-9 sm:py-9"
      >
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-accent-muted)]">
              내 담당 기준
            </p>
            <h2 className="mt-2 text-[clamp(1.5rem,2.9vw,1.8rem)] font-semibold tracking-tight text-[var(--crm-accent)] dark:text-zinc-50">
              안녕하세요, {profile?.name?.trim() || "팀"}
              {rankLabel ? ` ${rankLabel}` : ""}
              {rankMeta ? ` [${rankMeta.shortLabel}]` : ""}님. 오늘의 고객 흐름을 확인하세요.
            </h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
              {profile?.role === "admin"
                ? "본인에게 배정된 고객만 집계합니다. 전사 고객·직원 집계는 왼쪽「운영 / 관리자」메뉴에서 확인할 수 있습니다."
                : "본인에게 배정된 고객만 집계합니다. 오늘 연락·부재 정리·최근 유입을 우선 확인해 보세요."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/leads/new-db?create=1" className="crm-pill-primary">
                고객 추가
              </Link>
              <Link href="/leads/new-db" className="crm-pill-secondary">
                고객 목록
              </Link>
              <Link href="/leads/counseling-progress?fromDash=todayFollow" className="crm-pill-secondary">
                오늘 연락
              </Link>
              <Link href="/leads/counseling-progress" className="crm-pill-secondary">
                상담 기록
              </Link>
            </div>
          </div>
          <div className="w-full max-w-[420px] justify-self-end xl:max-w-none">
            <UserRankCard
              name={profile?.name?.trim() || "사용자"}
              rank={profile?.rank ?? null}
              className="min-h-[190px] w-full"
            />
          </div>
        </div>
      </motion.section>

      {loadError ? (
        <motion.section
          variants={dashItem}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-[15px] text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
        >
          고객 데이터 조회에 실패했습니다. 원인: {loadError}
        </motion.section>
      ) : null}

      {!loadError && leads && leads.length === 0 && !dataLoading ? (
        <motion.section
          variants={dashItem}
          className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-950"
        >
          <p className="text-[16px] font-semibold text-slate-800 dark:text-zinc-100">아직 표시할 고객이 없습니다.</p>
          <p className="mt-2 text-[15px] text-slate-600 dark:text-zinc-400">
            첫 고객을 등록하면 이 화면에 지표와 할 일이 채워집니다.
          </p>
          <Link href="/leads/new-db?create=1" className="crm-btn-primary mt-6 inline-flex">
            고객 추가하기
          </Link>
        </motion.section>
      ) : null}

      <motion.div variants={dashItem}>
        <DashboardKpiCards loading={dataLoading} values={kpiValues} pipeline={pipeline} />
      </motion.div>

      {isAdminTeamLeader ? (
        <motion.section variants={dashItem} className="crm-card rounded-[24px] p-6">
          <h3 className="text-lg font-semibold text-[var(--crm-accent)] dark:text-zinc-50">팀 기준 요약</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            팀장 전용 집계입니다. 팀원 담당 고객 기준으로 계산되며 개인 파이프라인 집계와 분리됩니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="text-xs text-zinc-500">팀 가시 사용자 수</div>
              <div className="mt-1 text-2xl font-bold">{teamVisibleUserIds.length}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="text-xs text-zinc-500">팀 담당 고객 수</div>
              <div className="mt-1 text-2xl font-bold">{teamLeads.length}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="text-xs text-zinc-500">팀 이번달 등록</div>
              <div className="mt-1 text-2xl font-bold">{teamMetrics?.thisMonthRegisteredCount ?? 0}</div>
            </div>
          </div>
        </motion.section>
      ) : null}

      <motion.div variants={dashItem}>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4 xl:items-stretch">
          <div className="min-w-0 xl:col-span-3">
            <DashboardTodoSection
              loading={dataLoading}
              todayLeads={todayContactLeads}
              recentAdded={recentAddedForTodo}
              recentCounseling={recentCounselingLeads}
              unresponsiveCount={metrics?.unresponsive ?? 0}
              onSelectLead={(id) => void openLead(id)}
            />
          </div>
          <div className="min-w-0 xl:col-span-1">
            <DashboardNoticesPreview profile={profile} variant="panel" className="h-full" />
          </div>
        </div>
      </motion.div>

    </motion.div>
  );
}
