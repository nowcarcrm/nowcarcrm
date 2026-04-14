"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { pipelineStageLabelForLead } from "../../_lib/staffOverviewMetrics";
import {
  downloadXlsxRows,
  formatDateForExcel,
  formatDateOnlyForExcel,
  formatWonForExcel,
  todayYmdKst,
} from "../../_lib/excelExport";
import { lastContactReferenceIso } from "../../_lib/leaseCrmLogic";
import { effectiveContractNetProfitForMetrics } from "../../_lib/leaseCrmContractPersist";
import { listActiveUsers } from "../../_lib/usersSupabase";
import { useLeadDetailModal } from "@/app/_components/admin/AdminShell";
import {
  canAccessAdminOverview,
  extractVisibleUserIds,
  filterUsersByScreenScope,
  getAdminOverviewScope,
  isTeamLeader,
  getTeamLeaderOverviewScope,
} from "../../_lib/screenScopes";
import {
  CrmListPaginationBar,
  CRM_LIST_PAGE_SIZE,
  crmSlicePage,
  crmTotalPages,
} from "@/app/_components/ui/CrmListPagination";

const STORAGE_MANAGER_KEY = "nowcar_all_customers_manager_user_id";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AllCustomersOperationalPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [lastConsultByLead, setLastConsultByLead] = useState<Map<string, string>>(
    () => new Map()
  );
  const [contractByLead, setContractByLead] = useState<
    Map<string, { feeWon: number; contractDate: string }>
  >(() => new Map());
  const [managerNameById, setManagerNameById] = useState<Map<string, { name: string; rank: string }>>(
    () => new Map()
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [periodView, setPeriodView] = useState<"year" | "month">("month");
  const [listPage, setListPage] = useState(1);
  const hydratedManagerRef = useRef(false);
  const { openLeadById } = useLeadDetailModal();
  const selectedUserId = (searchParams.get("managerUserId") ?? "").trim();
  const adminOverviewViewer = {
    id: profile?.userId,
    role: profile?.role,
    rank: profile?.rank,
    team_name: profile?.teamName,
    name: profile?.name,
  };
  const adminOverviewScope = getAdminOverviewScope(adminOverviewViewer);
  const canAccessOverviewPage = canAccessAdminOverview(adminOverviewViewer);
  const canUseManagerFilter =
    adminOverviewScope === "all" || adminOverviewScope === "all_except_executive" || adminOverviewScope === "team";

  const opScope = useMemo(() => {
    if (!profile) return null;
    return {
      role: profile.role,
      userId: profile.userId,
      email: profile.email ?? null,
      rank: profile.rank ?? null,
      teamName: profile.teamName ?? null,
      operationalFullAccess:
        adminOverviewScope === "all" || adminOverviewScope === "all_except_executive" || adminOverviewScope === "team",
    };
  }, [profile, adminOverviewScope]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile || !canAccessOverviewPage) {
      router.replace("/dashboard");
      return;
    }
    if (!opScope) return;
    let mounted = true;
    (async () => {
      try {
        const users = await listActiveUsers();
        const viewer = {
          id: profile.userId,
          role: profile.role,
          rank: profile.rank,
          team_name: profile.teamName,
          name: profile.name,
        };
        const teamLeaderVisibleIds = getTeamLeaderOverviewScope(viewer, users);
        const scopedUsers = filterUsersByScreenScope(
          users,
          viewer,
          adminOverviewScope
        );
        const visibleUserIds = new Set(
          adminOverviewScope === "team" ? teamLeaderVisibleIds : extractVisibleUserIds(scopedUsers)
        );
        console.log("[all-customers scope]", {
          currentUserRole: profile.role,
          currentUserRank: profile.rank,
          currentUserTeamName: profile.teamName,
          isTeamLeader: isTeamLeader(viewer),
          viewerId: profile.userId,
          rank: profile.rank,
          team: profile.teamName,
          scope: adminOverviewScope,
          teamLeaderOverviewIds: teamLeaderVisibleIds,
          visibleUserIds: [...visibleUserIds],
        });
        const nameMap = new Map(
          scopedUsers.map((u) => [u.id, { name: u.name?.trim() || "", rank: u.rank ?? "직급 미설정" }])
        );
        const loadedRaw = await loadLeadsFromStorage({
          ...opScope,
          visibleUserIds: [...visibleUserIds],
        });
        const loaded = loadedRaw.filter((l) => {
          const managerId = (l.managerUserId ?? "").trim();
          return !!managerId && visibleUserIds.has(managerId);
        });
        const ids = loaded.map((l) => l.id);
        const [consultMap, contractMap] = await Promise.all([
          fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
          fetchContractFeeSummaryByLeadIds(ids, opScope),
        ]);
        if (!mounted) return;
        setManagerNameById(nameMap);
        setLastConsultByLead(consultMap);
        setContractByLead(contractMap);
        setLoadError(null);
        setLeads(loaded);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        toast.error("전체 고객을 불러오지 못했습니다.");
        setLeads([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading, router, opScope, adminOverviewScope]);

  const sortedLeads = useMemo(() => {
    if (!leads) return [];
    return [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = search.replace(/\D/g, "");
    return sortedLeads.filter((l) => {
      if (selectedUserId && canUseManagerFilter && (l.managerUserId ?? "") !== selectedUserId) return false;
      const created = new Date(l.createdAt);
      if (!Number.isNaN(created.getTime())) {
        if (yearFilter && String(created.getFullYear()) !== yearFilter) return false;
        if (monthFilter && String(created.getMonth() + 1).padStart(2, "0") !== monthFilter) return false;
        if (dayFilter && String(created.getDate()).padStart(2, "0") !== dayFilter) return false;
      }
      if (!q) return true;
      const name = l.base.name.toLowerCase();
      const phone = l.base.phone.toLowerCase();
      const phoneD = l.base.phone.replace(/\D/g, "");
      const mid = (l.managerUserId ?? "").trim();
      const mgr = (mid ? managerNameById.get(mid)?.name : "") || l.base.ownerStaff || "";
      const mgrLower = mgr.toLowerCase();
      if (name.includes(q) || phone.includes(q) || mgrLower.includes(q)) return true;
      if (qd.length >= 2 && phoneD.includes(qd)) return true;
      return false;
    });
  }, [sortedLeads, search, managerNameById, selectedUserId, yearFilter, monthFilter, dayFilter, canUseManagerFilter]);

  useEffect(() => {
    setListPage(1);
  }, [search, selectedUserId, yearFilter, monthFilter, dayFilter]);

  const safeListPage = Math.min(
    Math.max(1, listPage),
    crmTotalPages(filteredLeads.length, CRM_LIST_PAGE_SIZE)
  );
  const pagedLeads = useMemo(
    () => crmSlicePage(filteredLeads, safeListPage, CRM_LIST_PAGE_SIZE),
    [filteredLeads, safeListPage]
  );

  useEffect(() => {
    setListPage((p) =>
      Math.min(Math.max(1, p), crmTotalPages(filteredLeads.length, CRM_LIST_PAGE_SIZE))
    );
  }, [filteredLeads.length]);

  const staffSelectOptions = useMemo(() => {
    return [...managerNameById.entries()]
      .filter(([id]) => !!id)
      .map(([id, info]) => ({
        id,
        name: info?.name || id,
        rank: info?.rank || "직급 미설정",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [managerNameById]);

  const setSelectedManagerUserId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("managerUserId", id);
      else next.delete("managerUserId");
      const qs = next.toString();
      const base = pathname || "/operations/all-customers";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
      try {
        if (id) window.localStorage.setItem(STORAGE_MANAGER_KEY, id);
        else window.localStorage.removeItem(STORAGE_MANAGER_KEY);
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
      const saved = window.localStorage.getItem(STORAGE_MANAGER_KEY)?.trim();
      if (!saved) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("managerUserId", saved);
      const base = pathname || "/operations/all-customers";
      router.replace(`${base}?${next.toString()}`, { scroll: false });
    } catch {
      /* ignore */
    }
  }, [pathname, router, searchParams]);

  const yearlyBuckets = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const lead of sortedLeads) {
      const d = new Date(lead.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const y = String(d.getFullYear());
      bucket.set(y, (bucket.get(y) ?? 0) + 1);
    }
    return [...bucket.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sortedLeads]);

  const monthlyBuckets = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const lead of sortedLeads) {
      const d = new Date(lead.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
    return [...bucket.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sortedLeads]);

  const openLead = useCallback(
    async (id: string) => {
      await openLeadById(id);
    },
    [openLeadById]
  );

  const onDownloadExcel = useCallback(() => {
    if (!filteredLeads.length) {
      toast.error("보낼 데이터가 없습니다.");
      return;
    }
    const rows = filteredLeads.map((l) => {
      const mid = (l.managerUserId ?? "").trim();
      const consult = lastConsultByLead.get(l.id);
      const recent =
        consult && consult > lastContactReferenceIso(l) ? consult : lastContactReferenceIso(l);
      const feeFromLead =
        l.contract != null
          ? effectiveContractNetProfitForMetrics(l.contract)
          : contractByLead.get(l.id)?.feeWon ?? null;
      const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "";
      return {
        등록일: formatDateOnlyForExcel(l.createdAt),
        고객명: l.base.name,
        연락처: l.base.phone,
        담당자: mid
          ? `${managerNameById.get(mid)?.name || l.base.ownerStaff} · ${managerNameById.get(mid)?.rank ?? "직급 미설정"}`
          : l.base.ownerStaff,
        상담결과: l.counselingStatus,
        현재단계: pipelineStageLabelForLead(l),
        다음연락예정일: formatDateOnlyForExcel(l.nextContactAt),
        최근상담일: formatDateForExcel(recent),
        차량정보: vehicle,
        총수익: formatWonForExcel(feeFromLead),
      };
    });
    downloadXlsxRows(rows, "전체상담고객", `전체상담고객_${todayYmdKst()}`);
    toast.success("엑셀 파일을 저장했습니다.");
  }, [filteredLeads, lastConsultByLead, managerNameById, contractByLead]);

  if (authLoading || !profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>
    );
  }

  if (!canAccessOverviewPage) {
    return null;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400">
              운영 · 관리자 보고
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
              전체 상담 고객
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
              전사 DB·인수인계·백업용입니다. 관리자는 상단 직원 필터로 담당자별로 좁혀 볼 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadExcel}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-600/80 bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            엑셀 다운로드
          </button>
        </div>
        <div className="mt-4 max-w-md">
          <label className="mb-1 block text-[12px] font-medium text-slate-500 dark:text-zinc-400">
            검색 (고객명 · 연락처 · 담당자명)
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="crm-field w-full text-[14px]"
            placeholder="검색어 입력"
          />
        </div>
        {canUseManagerFilter ? (
          <div className="mt-4 max-w-md">
            <label className="mb-1 block text-[12px] font-medium text-slate-500 dark:text-zinc-400">
              직원 필터 (담당자)
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedManagerUserId(e.target.value)}
              className="crm-field crm-field-select w-full text-[14px]"
            >
              <option value="">전체</option>
              {staffSelectOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.rank}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              setYearFilter(String(d.getFullYear()));
              setMonthFilter(String(d.getMonth() + 1).padStart(2, "0"));
              setDayFilter(String(d.getDate()).padStart(2, "0"));
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              setYearFilter(String(d.getFullYear()));
              setMonthFilter(String(d.getMonth() + 1).padStart(2, "0"));
              setDayFilter("");
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            이번달
          </button>
          <button
            type="button"
            onClick={() => {
              setYearFilter("");
              setMonthFilter("");
              setDayFilter("");
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            전체
          </button>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="crm-field crm-field-select text-[13px]">
            <option value="">연도 전체</option>
            {Array.from(new Set(sortedLeads.map((l) => String(new Date(l.createdAt).getFullYear()))))
              .filter((y) => y !== "NaN")
              .sort((a, b) => (a < b ? 1 : -1))
              .map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="crm-field crm-field-select text-[13px]">
            <option value="">월 전체</option>
            {Array.from({ length: 12 }).map((_, i) => {
              const mm = String(i + 1).padStart(2, "0");
              return (
                <option key={mm} value={mm}>
                  {i + 1}월
                </option>
              );
            })}
          </select>
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="crm-field crm-field-select text-[13px]">
            <option value="">일 전체</option>
            {Array.from({ length: 31 }).map((_, i) => {
              const dd = String(i + 1).padStart(2, "0");
              return (
                <option key={dd} value={dd}>
                  {i + 1}일
                </option>
              );
            })}
          </select>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-zinc-800/80">
          <p className="mb-2 text-[12px] font-medium text-slate-500 dark:text-zinc-400">
            등록일 기준 집계
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPeriodView("year")}
              className={cn(
                "rounded-lg border bg-white px-3 py-1.5 text-[12px] font-semibold transition",
                periodView === "year"
                  ? "border-sky-500 text-sky-800 ring-2 ring-sky-500/30 dark:border-sky-400 dark:text-sky-200"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              )}
            >
              연도별
            </button>
            <button
              type="button"
              onClick={() => setPeriodView("month")}
              className={cn(
                "rounded-lg border bg-white px-3 py-1.5 text-[12px] font-semibold transition",
                periodView === "month"
                  ? "border-sky-500 text-sky-800 ring-2 ring-sky-500/30 dark:border-sky-400 dark:text-sky-200"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              )}
            >
              월별
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodView === "year"
              ? yearlyBuckets.map(([y, count]) => {
                  const active = yearFilter === y && !monthFilter && !dayFilter;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setYearFilter(y);
                        setMonthFilter("");
                        setDayFilter("");
                      }}
                      className={cn(
                        "rounded-lg border bg-white px-2.5 py-1 text-[12px] font-medium transition",
                        active
                          ? "border-sky-500 text-sky-800 ring-2 ring-sky-500/30 dark:border-sky-400 dark:text-sky-200"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                      )}
                    >
                      {y}년 ({count})
                    </button>
                  );
                })
              : monthlyBuckets.map(([month, count]) => {
                  const [yy, mm] = month.split("-");
                  const active = yearFilter === yy && monthFilter === mm && !dayFilter;
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => {
                        setYearFilter(yy);
                        setMonthFilter(mm);
                        setDayFilter("");
                      }}
                      className={cn(
                        "rounded-lg border bg-white px-2.5 py-1 text-[12px] font-medium transition",
                        active
                          ? "border-sky-500 text-sky-800 ring-2 ring-sky-500/30 dark:border-sky-400 dark:text-sky-200"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                      )}
                    >
                      {month} ({count})
                    </button>
                  );
                })}
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <th className="px-3 py-3">등록일</th>
                <th className="px-3 py-3">고객명</th>
                <th className="px-3 py-3">연락처</th>
                <th className="px-3 py-3">담당자</th>
                <th className="px-3 py-3">상담결과</th>
                <th className="px-3 py-3">현재 단계</th>
                <th className="px-3 py-3">다음 연락</th>
                <th className="px-3 py-3">최근 상담</th>
                <th className="px-3 py-3">희망 차종</th>
                <th className="px-3 py-3">총수익</th>
                <th className="px-3 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {leads === null ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-slate-500">
                    {sortedLeads.length === 0 ? "등록된 고객이 없습니다." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                pagedLeads.map((l) => {
                  const mid = (l.managerUserId ?? "").trim();
                  const mgr =
                    (mid && managerNameById.get(mid)?.name) || l.base.ownerStaff || "—";
                  const mgrPosition = (mid && managerNameById.get(mid)?.rank) || "직급 미설정";
                  const consult = lastConsultByLead.get(l.id);
                  const recent =
                    consult && consult > lastContactReferenceIso(l)
                      ? consult
                      : lastContactReferenceIso(l);
                  const feeFromLead =
                    l.contract != null
                      ? effectiveContractNetProfitForMetrics(l.contract)
                      : contractByLead.get(l.id)?.feeWon ?? null;
                  const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "—";
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-slate-100 transition hover:bg-sky-50/60 dark:border-zinc-800/80 dark:hover:bg-sky-950/25"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-zinc-100">
                        {l.base.name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {l.base.phone}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">{mgr} · {mgrPosition}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            "border-slate-200 bg-white text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          )}
                        >
                          {l.counselingStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {pipelineStageLabelForLead(l)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.nextContactAt)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateForExcel(recent)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {vehicle}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-800 dark:text-zinc-200">
                        {feeFromLead != null && feeFromLead > 0
                          ? `${Math.floor(feeFromLead).toLocaleString("ko-KR")}원`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openLead(l.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-sky-700 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-zinc-800"
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
          page={safeListPage}
          total={filteredLeads.length}
          onPageChange={setListPage}
        />
      </div>

    </div>
  );
}
