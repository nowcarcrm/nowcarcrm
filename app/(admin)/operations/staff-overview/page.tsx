"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import {
  fetchContractFeeSummaryByLeadIds,
  fetchMaxConsultationCreatedAtByLeadIds,
} from "../../_lib/leaseCrmSupabase";
import {
  loadLeadsFromStorage,
} from "../../_lib/leaseCrmStorage";
import type { Lead } from "../../_lib/leaseCrmTypes";
import {
  buildOrgSummary,
  buildStaffOverviewRows,
  pipelineStageLabelForLead,
  type StaffOverviewOrgSummary,
  type StaffOverviewRow,
} from "../../_lib/staffOverviewMetrics";
import {
  downloadXlsxRows,
  formatDateForExcel,
  formatDateOnlyForExcel,
  formatWonForExcel,
  todayYmdKst,
} from "../../_lib/excelExport";
import { lastContactReferenceIso } from "../../_lib/leaseCrmLogic";
import { effectiveContractFeeForMetrics } from "../../_lib/leaseCrmContractPersist";
import { listActiveUsers } from "../../_lib/usersSupabase";
import { useLeadDetailModal } from "@/app/_components/admin/AdminShell";
import {
  CrmListPaginationBar,
  CRM_LIST_PAGE_SIZE,
  crmSlicePage,
  crmTotalPages,
} from "@/app/_components/ui/CrmListPagination";

const STORAGE_STAFF_OVERVIEW_MANAGER_KEY = "nowcar_staff_overview_manager_user_id";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{sub}</div> : null}
    </div>
  );
}

export default function StaffOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [overviewRows, setOverviewRows] = useState<StaffOverviewRow[]>([]);
  const [orgSummary, setOrgSummary] = useState<StaffOverviewOrgSummary | null>(null);
  const [contractByLead, setContractByLead] = useState<
    Map<string, { feeWon: number; contractDate: string }>
  >(() => new Map());
  const [lastConsultByLead, setLastConsultByLead] = useState<Map<string, string>>(
    () => new Map()
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overviewListPage, setOverviewListPage] = useState(1);
  const [detailListPage, setDetailListPage] = useState(1);
  const hydratedManagerRef = useRef(false);
  const { openLeadById } = useLeadDetailModal();
  const managerUserIdFilter = (searchParams.get("managerUserId") ?? "").trim();
  const isAdmin = profile?.role === "admin";

  const opScope = useMemo(() => {
    if (!profile || profile.role !== "admin") return null;
    return {
      role: "admin" as const,
      userId: profile.userId,
      operationalFullAccess: true,
    };
  }, [profile]);

  const refreshAggregates = useCallback(
    async (nextLeads: Lead[], users: Awaited<ReturnType<typeof listActiveUsers>>) => {
      if (!opScope) return;
      const ids = nextLeads.map((l) => l.id);
      const [contracts, consultMap] = await Promise.all([
        fetchContractFeeSummaryByLeadIds(ids, opScope),
        fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
      ]);
      const rows = buildStaffOverviewRows(nextLeads, users, contracts, consultMap);
      setContractByLead(contracts);
      setLastConsultByLead(consultMap);
      setOverviewRows(rows);
      setOrgSummary(buildOrgSummary(users.length, nextLeads, contracts));
    },
    [opScope]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!profile || profile.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (!opScope) return;
    let mounted = true;
    (async () => {
      try {
        const users = await listActiveUsers();
        const loaded = await loadLeadsFromStorage(opScope);
        const ids = loaded.map((l) => l.id);
        const [contracts, consultMap] = await Promise.all([
          fetchContractFeeSummaryByLeadIds(ids, opScope),
          fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
        ]);
        const rows = buildStaffOverviewRows(loaded, users, contracts, consultMap);
        const org = buildOrgSummary(users.length, loaded, contracts);
        if (!mounted) return;
        setContractByLead(contracts);
        setLastConsultByLead(consultMap);
        setOverviewRows(rows);
        setOrgSummary(org);
        setLoadError(null);
        setLeads(loaded);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        toast.error("직원 현황을 불러오지 못했습니다.");
        setLeads([]);
        setOverviewRows([]);
        setOrgSummary(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading, router, opScope]);

  const setManagerUserIdFilter = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("managerUserId", id);
      else next.delete("managerUserId");
      const qs = next.toString();
      const base = pathname || "/operations/staff-overview";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
      try {
        if (id) window.localStorage.setItem(STORAGE_STAFF_OVERVIEW_MANAGER_KEY, id);
        else window.localStorage.removeItem(STORAGE_STAFF_OVERVIEW_MANAGER_KEY);
      } catch {
        /* ignore */
      }
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (hydratedManagerRef.current) return;
    hydratedManagerRef.current = true;
    if (typeof window === "undefined") return;
    const fromUrl = (searchParams.get("managerUserId") ?? "").trim();
    if (fromUrl) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_STAFF_OVERVIEW_MANAGER_KEY)?.trim();
      if (!saved) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("managerUserId", saved);
      const base = pathname || "/operations/staff-overview";
      router.replace(`${base}?${next.toString()}`, { scroll: false });
    } catch {
      /* ignore */
    }
  }, [pathname, router, searchParams]);

  const staffSelectOptions = useMemo(() => {
    return [...overviewRows]
      .map((r) => ({ id: r.userId, name: r.name || r.email || r.userId }))
      .filter((o) => !!o.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [overviewRows]);

  const filteredOverviewRows = useMemo(() => {
    if (!managerUserIdFilter) return overviewRows;
    return overviewRows.filter((r) => r.userId === managerUserIdFilter);
  }, [overviewRows, managerUserIdFilter]);

  const displayOrgSummary = useMemo((): StaffOverviewOrgSummary | null => {
    if (!leads || !orgSummary) return null;
    if (!managerUserIdFilter) return orgSummary;
    const fl = leads.filter((l) => (l.managerUserId ?? "").trim() === managerUserIdFilter);
    return buildOrgSummary(1, fl, contractByLead);
  }, [leads, orgSummary, managerUserIdFilter, contractByLead]);

  const leadsForSelected = useMemo(() => {
    if (!leads || !managerUserIdFilter) return [];
    return leads.filter((l) => (l.managerUserId ?? "").trim() === managerUserIdFilter);
  }, [leads, managerUserIdFilter]);

  const sortedDetailLeads = useMemo(() => {
    return [...leadsForSelected].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [leadsForSelected]);

  useEffect(() => {
    setOverviewListPage(1);
  }, [managerUserIdFilter, overviewRows.length]);

  useEffect(() => {
    setDetailListPage(1);
  }, [managerUserIdFilter, leadsForSelected.length]);

  const safeOverviewPage = Math.min(
    Math.max(1, overviewListPage),
    crmTotalPages(filteredOverviewRows.length, CRM_LIST_PAGE_SIZE)
  );
  const pagedOverviewRows = useMemo(
    () => crmSlicePage(filteredOverviewRows, safeOverviewPage, CRM_LIST_PAGE_SIZE),
    [filteredOverviewRows, safeOverviewPage]
  );

  useEffect(() => {
    setOverviewListPage((p) =>
      Math.min(Math.max(1, p), crmTotalPages(filteredOverviewRows.length, CRM_LIST_PAGE_SIZE))
    );
  }, [filteredOverviewRows.length]);

  const safeDetailPage = Math.min(
    Math.max(1, detailListPage),
    crmTotalPages(sortedDetailLeads.length, CRM_LIST_PAGE_SIZE)
  );
  const pagedDetailLeads = useMemo(
    () => crmSlicePage(sortedDetailLeads, safeDetailPage, CRM_LIST_PAGE_SIZE),
    [sortedDetailLeads, safeDetailPage]
  );

  useEffect(() => {
    setDetailListPage((p) =>
      Math.min(Math.max(1, p), crmTotalPages(sortedDetailLeads.length, CRM_LIST_PAGE_SIZE))
    );
  }, [sortedDetailLeads.length]);

  const selectedName = useMemo(() => {
    if (!managerUserIdFilter) return "";
    return overviewRows.find((r) => r.userId === managerUserIdFilter)?.name ?? "";
  }, [overviewRows, managerUserIdFilter]);

  const openLead = useCallback(
    async (id: string) => {
      await openLeadById(id);
    },
    [openLeadById]
  );

  const downloadSummaryExcel = useCallback(() => {
    if (!filteredOverviewRows.length) {
      toast.error("보낼 데이터가 없습니다.");
      return;
    }
    const rows = filteredOverviewRows.map((r) => ({
      직원명: r.name,
      이메일: r.email,
      권한: r.roleLabel,
      현재담당고객수: r.assignedTotal,
      오늘등록: r.registeredToday,
      이번달등록: r.registeredThisMonth,
      신규: r.countNew,
      상담중: r.countCounseling,
      부재: r.countAbsent,
      계약: r.countContract,
      출고: r.countExport,
      인도완료: r.countDelivered,
      보류: r.countHold,
      취소: r.countCancel,
      오늘연락예정: r.todayNextContactCount,
      최근상담일: r.lastConsultAt ? formatDateForExcel(r.lastConsultAt) : "-",
      이번달예상수수료: formatWon(r.feeThisMonthWon),
    }));
    downloadXlsxRows(rows, "직원현황요약", `직원현황요약_${todayYmdKst()}`);
    toast.success("요약 엑셀을 저장했습니다.");
  }, [filteredOverviewRows]);

  const downloadStaffLeadsExcel = useCallback(
    (userId: string, displayName: string, list: Lead[]) => {
      if (!list.length) {
        toast.error("보낼 고객이 없습니다.");
        return;
      }
      const safeName = displayName.replace(/[<>:"/\\|?*\s]+/g, "_").slice(0, 40) || "직원";
      const rows = [...list]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((l) => {
          const consult = lastConsultByLead.get(l.id);
          const recent =
            consult && consult > lastContactReferenceIso(l)
              ? consult
              : lastContactReferenceIso(l);
          const fee =
            l.contract != null
              ? effectiveContractFeeForMetrics(l.contract)
              : contractByLead.get(l.id)?.feeWon ?? null;
          const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "";
          return {
            등록일: formatDateOnlyForExcel(l.createdAt),
            고객명: l.base.name,
            연락처: l.base.phone,
            상담결과: l.counselingStatus,
            현재단계: pipelineStageLabelForLead(l),
            다음연락예정일: formatDateOnlyForExcel(l.nextContactAt),
            최근상담일: formatDateForExcel(recent),
            차량정보: vehicle,
            수수료: formatWonForExcel(fee),
          };
        });
      downloadXlsxRows(rows, "고객목록", `${safeName}_고객목록_${todayYmdKst()}`);
      toast.success("고객 목록 엑셀을 저장했습니다.");
    },
    [lastConsultByLead, contractByLead]
  );

  if (authLoading || !profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>
    );
  }

  if (profile.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-400">
              운영 · 관리자 보고
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
              직원 현황
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
              집계는 <span className="font-medium text-slate-800 dark:text-zinc-200">manager_user_id</span> 기준이며,
              단계는 파이프라인(stage) 한 버킷으로 산출합니다.
            </p>
            {isAdmin ? (
              <div className="mt-4 max-w-md">
                <label className="mb-1 block text-[12px] font-medium text-slate-500 dark:text-zinc-400">
                  직원 필터
                </label>
                <select
                  value={managerUserIdFilter}
                  onChange={(e) => setManagerUserIdFilter(e.target.value)}
                  className="crm-field crm-field-select w-full text-[14px]"
                >
                  <option value="">전체</option>
                  {staffSelectOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={downloadSummaryExcel}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-600/80 bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            요약 엑셀
          </button>
        </div>
      </header>

      {displayOrgSummary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="전체 직원 수" value={displayOrgSummary.staffCount} />
          <SummaryCard label="전체 고객 수" value={displayOrgSummary.totalLeads} sub="DB 전체 행" />
          <SummaryCard label="오늘 등록" value={displayOrgSummary.registeredToday} />
          <SummaryCard label="이번 달 등록" value={displayOrgSummary.registeredThisMonth} />
          <SummaryCard
            label="이번 달 예상 수수료"
            value={formatWon(displayOrgSummary.feeThisMonthWon)}
          />
          <SummaryCard label="오늘 연락 예정" value={displayOrgSummary.todayNextContactTotal} />
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-[1680px] w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <th className="px-2 py-2.5">직원명</th>
                <th className="px-2 py-2.5">이메일</th>
                <th className="px-2 py-2.5">권한</th>
                <th className="px-2 py-2.5">담당</th>
                <th className="px-2 py-2.5">오늘등록</th>
                <th className="px-2 py-2.5">월등록</th>
                <th className="px-2 py-2.5">신규</th>
                <th className="px-2 py-2.5">상담중</th>
                <th className="px-2 py-2.5">부재</th>
                <th className="px-2 py-2.5">계약</th>
                <th className="px-2 py-2.5">출고</th>
                <th className="px-2 py-2.5">인도</th>
                <th className="px-2 py-2.5">보류</th>
                <th className="px-2 py-2.5">취소</th>
                <th className="px-2 py-2.5">오늘연락</th>
                <th className="px-2 py-2.5">최근상담</th>
                <th className="px-2 py-2.5">월수수료</th>
                <th className="px-2 py-2.5 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {leads === null ? (
                <tr>
                  <td colSpan={18} className="px-3 py-12 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredOverviewRows.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-3 py-12 text-center text-slate-500">
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                pagedOverviewRows.map((r) => {
                  const active = managerUserIdFilter === r.userId;
                  const rowLeads =
                    leads?.filter((l) => (l.managerUserId ?? "").trim() === r.userId) ?? [];
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "border-b border-slate-100 transition dark:border-zinc-800/80",
                        active
                          ? "bg-violet-50 dark:bg-violet-950/35"
                          : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                      )}
                    >
                      <td className="px-2 py-2 font-semibold text-slate-900 dark:text-zinc-100">
                        <button
                          type="button"
                          className="text-left underline-offset-2 hover:underline"
                          onClick={() =>
                            setManagerUserIdFilter(managerUserIdFilter === r.userId ? "" : r.userId)
                          }
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="max-w-[140px] truncate px-2 py-2 text-slate-600 dark:text-zinc-400">
                        {r.email || "—"}
                      </td>
                      <td className="px-2 py-2">{r.roleLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{r.assignedTotal}</td>
                      <td className="px-2 py-2 tabular-nums">{r.registeredToday}</td>
                      <td className="px-2 py-2 tabular-nums">{r.registeredThisMonth}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countNew}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countCounseling}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countAbsent}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countContract}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countExport}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countDelivered}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countHold}</td>
                      <td className="px-2 py-2 tabular-nums">{r.countCancel}</td>
                      <td className="px-2 py-2 tabular-nums">{r.todayNextContactCount}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {r.lastConsultAt ? formatDateForExcel(r.lastConsultAt) : "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatWon(r.feeThisMonthWon)}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link
                            href={`/operations/staff/${r.userId}`}
                            className="inline-flex rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-950/50 dark:text-violet-200"
                          >
                            상세
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadStaffLeadsExcel(r.userId, r.name, rowLeads);
                            }}
                            className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200"
                          >
                            엑셀
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <CrmListPaginationBar
          page={safeOverviewPage}
          total={filteredOverviewRows.length}
          onPageChange={setOverviewListPage}
        />
      </div>

      {managerUserIdFilter ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
              {selectedName} · 고객 {leadsForSelected.length}건
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/operations/staff/${managerUserIdFilter}`}
                className="inline-flex items-center rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-[13px] font-semibold text-violet-900 dark:border-violet-500/40 dark:bg-violet-950/50 dark:text-violet-100"
              >
                전체 화면으로
              </Link>
              <button
                type="button"
                onClick={() =>
                  downloadStaffLeadsExcel(managerUserIdFilter, selectedName, leadsForSelected)
                }
                disabled={!leadsForSelected.length}
                className="inline-flex items-center rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이 직원 고객 엑셀
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">고객명</th>
                  <th className="py-2 pr-3">연락처</th>
                  <th className="py-2 pr-3">등록일</th>
                  <th className="py-2 pr-3">상담결과</th>
                  <th className="py-2 pr-3">단계</th>
                  <th className="py-2 pr-3">다음 연락</th>
                  <th className="py-2 pr-3">최근 상담</th>
                  <th className="py-2 pr-3">차량</th>
                  <th className="py-2 pr-3">수수료</th>
                  <th className="py-2 pr-3 text-right">상세</th>
                </tr>
              </thead>
              <tbody>
                {leadsForSelected.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      담당 고객이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pagedDetailLeads.map((l) => {
                      const consult = lastConsultByLead.get(l.id);
                      const recent =
                        consult && consult > lastContactReferenceIso(l)
                          ? consult
                          : lastContactReferenceIso(l);
                      const fee =
                        l.contract != null
                          ? effectiveContractFeeForMetrics(l.contract)
                          : contractByLead.get(l.id)?.feeWon ?? null;
                      const vehicle =
                        l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "—";
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-slate-100 dark:border-zinc-800"
                        >
                          <td className="py-2 pr-3 font-medium text-slate-900 dark:text-zinc-100">
                            {l.base.name}
                          </td>
                          <td className="py-2 pr-3 text-slate-700 dark:text-zinc-300">
                            {l.base.phone}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                            {formatDateOnlyForExcel(l.createdAt)}
                          </td>
                          <td className="py-2 pr-3">{l.counselingStatus}</td>
                          <td className="py-2 pr-3">{pipelineStageLabelForLead(l)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                            {formatDateOnlyForExcel(l.nextContactAt)}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                            {formatDateForExcel(recent)}
                          </td>
                          <td className="py-2 pr-3 text-slate-700 dark:text-zinc-300">{vehicle}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {fee != null && fee > 0 ? formatWon(fee) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <button
                              type="button"
                              onClick={() => void openLead(l.id)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-medium text-sky-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-sky-300 dark:hover:bg-zinc-800"
                            >
                              상세
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
          <CrmListPaginationBar
            page={safeDetailPage}
            total={sortedDetailLeads.length}
            onPageChange={setDetailListPage}
          />
        </section>
      ) : null}

    </div>
  );
}
