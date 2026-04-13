"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { dashboardPageStagger, dashboardSectionItem } from "@/app/_lib/crmMotion";
import {
  computeDashboardMetrics,
  computePipelineStageCounts,
  pathnameAfterCounselingStatusChange,
  pickRecentCounselingLeads,
  pickRecentLeads,
  pickTodayContactLeads,
} from "../_lib/leaseCrmLogic";
import { fetchLeadById } from "../_lib/leaseCrmSupabase";
import { ensureSeedLeads, loadLeadsFromStorage, applyStaffLeadClientLocks, updateLead, deleteLeadById } from "../_lib/leaseCrmStorage";
import type { Lead } from "../_lib/leaseCrmTypes";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import LeadDetailModal from "../leads/_components/LeadDetailModal";
import DashboardKpiCards, { type DashboardKpiValues } from "./_components/DashboardKpiCards";
import DashboardNoticesPreview from "./_components/DashboardNoticesPreview";
import DashboardTodoSection from "./_components/DashboardTodoSection";

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const reduce = !!reduceMotion;
  const dashStagger = dashboardPageStagger(reduce);
  const dashItem = dashboardSectionItem(reduce);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalLead, setModalLead] = useState<Lead | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const scope = useMemo(
    () => (profile ? { role: profile.role, userId: profile.userId } : null),
    [profile]
  );

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
        if (!mounted) return;
        setLoadError(null);
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
      expectedCommissionWon: metrics.expectedCommissionTotal,
      confirmedCommissionThisMonthWon: metrics.thisMonthConfirmedCommissionWon,
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
      expected: "취소 제외 + 계약/견적 수수료",
      confirmed: "계약 파이프라인 + contract_date 이번달",
    };
    const sumColumn = {
      expected: "contract.fee(or final_fee_amount)/quoteHistory.feeAmount",
      confirmed: "contract.fee(or final_fee_amount)",
    };
    console.log("dashboard commission query params:", { dateRange, statusFilter, sumColumn });
    console.log("dashboard commission result:", {
      expectedCommissionWon: metrics.expectedCommissionTotal,
      confirmedCommissionThisMonthWon: metrics.thisMonthConfirmedCommissionWon,
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

  const openLead = useCallback(
    async (id: string) => {
      if (!scope) return;
      setModalLoading(true);
      try {
        const lead = await fetchLeadById(id, scope);
        if (!lead) {
          toast.error("고객을 찾을 수 없거나 권한이 없습니다.");
          return;
        }
        setModalLead(lead);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "고객을 불러오지 못했습니다.");
      } finally {
        setModalLoading(false);
      }
    },
    [scope]
  );

  return (
    <motion.div
      className="space-y-10 pb-10"
      variants={dashStagger}
      initial="hidden"
      animate="show"
    >
      <motion.section
        variants={dashItem}
        className="rounded-2xl border border-slate-200/80 bg-white px-5 py-6 shadow-[var(--crm-shadow-sm)] sm:px-8 sm:py-8 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-accent-muted)]">
          내 담당 기준
        </p>
        <h2 className="mt-2 text-[clamp(1.35rem,2.5vw,1.75rem)] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-50">
          안녕하세요, {profile?.name?.trim() || "팀"}. 오늘의 고객 흐름을 확인하세요.
        </h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
          {profile?.role === "admin"
            ? "본인에게 배정된 고객만 집계합니다. 전사 고객·직원 집계는 왼쪽「운영 / 관리자」메뉴에서 확인할 수 있습니다."
            : "본인에게 배정된 고객만 집계합니다. 오늘 연락·부재 정리·최근 유입을 우선 확인해 보세요."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
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

      {modalLoading ? (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-black/20 text-[15px] font-medium text-slate-700 dark:text-zinc-200">
          불러오는 중…
        </div>
      ) : null}

      {modalLead && profile ? (
        <LeadDetailModal
          key={modalLead.id}
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onUpdate={async (next) => {
            if (profile.role === "staff") {
              const myName = profile.name?.trim() ?? "";
              if (next.managerUserId != null && next.managerUserId !== profile.userId) {
                toast.error("담당 직원은 본인만 지정할 수 있습니다.");
                return;
              }
              if (myName && next.base.ownerStaff?.trim() !== myName) {
                toast.error("담당 직원은 본인만 지정할 수 있습니다.");
                return;
              }
            }
            const payload =
              profile.role === "staff"
                ? applyStaffLeadClientLocks(next, { userId: profile.userId, name: profile.name })
                : next;
            await updateLead(payload, { role: profile.role, userId: profile.userId });
            const [refreshedLead, refreshedLeads] = await Promise.all([
              fetchLeadById(payload.id, { role: profile.role, userId: profile.userId }),
              loadLeadsFromStorage({ role: profile.role, userId: profile.userId }),
            ]);
            setModalLead(refreshedLead ?? payload);
            setLeads(refreshedLeads);
            const nextPath = pathnameAfterCounselingStatusChange(payload.counselingStatus);
            if (pathname !== nextPath) {
              router.push(nextPath);
            }
          }}
          onDelete={(id) => {
            void (async () => {
              try {
                await deleteLeadById(id, { role: profile.role, userId: profile.userId });
                setModalLead(null);
                const refreshed = await loadLeadsFromStorage({
                  role: profile.role,
                  userId: profile.userId,
                });
                setLeads(refreshed);
                toast.success("삭제되었습니다.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
              }
            })();
          }}
        />
      ) : null}
    </motion.div>
  );
}
