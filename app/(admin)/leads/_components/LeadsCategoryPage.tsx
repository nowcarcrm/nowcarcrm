"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CONSULT_RESULT_OPTIONS,
  FAILURE_REASON_OPTIONS,
  LEAD_PRIORITY_OPTIONS,
  requiresFailureReasonStatus,
  type CounselingStatus,
  type Lead,
  type LeadCategoryKey,
  type LeadPriority,
  type LeadTemperature,
} from "../../_lib/leaseCrmTypes";
import {
  computeCategory,
  computeAutomationCounts,
  daysAgo,
  isContractPipelineCounselingStatus,
  isDeliveryDueSoon,
  isToday,
  lastContactReferenceIso,
  pathnameAfterCounselingStatusChange,
} from "../../_lib/leaseCrmLogic";
import { formatSupabaseError } from "../../_lib/leaseCrmSupabase";
import {
  applyStaffLeadClientLocks,
  createLead,
  deleteLeadById,
  ensureSeedLeads,
  loadLeadsFromStorage,
  updateLead,
} from "../../_lib/leaseCrmStorage";
import { getSupabaseConfigStatus, supabase } from "../../_lib/supabaseClient";
import LeadCreateModal from "./LeadCreateModal";
import { useLeadDetailModal, useLeadListSearch } from "@/app/_components/admin/AdminShell";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { listActiveUsers } from "../../_lib/usersSupabase";
import toast from "react-hot-toast";
import { devLog } from "@/app/_lib/devLog";
import { AnimatedStatNumber, LeadTableSkeleton, TapButton } from "@/app/_components/ui/crm-motion";
import { downloadXlsxRows, formatDateOnlyForExcel, todayYmdKst } from "../../_lib/excelExport";
import {
  CrmListPaginationBar,
  CRM_LIST_PAGE_SIZE,
  crmSlicePage,
  crmTotalPages,
} from "@/app/_components/ui/CrmListPagination";
import { getPersonalPipelineScope } from "../../_lib/screenScopes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isMissingRelationTableError(error: unknown): boolean {
  const msg = formatSupabaseError(error).toLowerCase();
  return (
    msg.includes("pgrst205") ||
    msg.includes("not found") ||
    msg.includes("could not find the table") ||
    msg.includes("public.consultations") ||
    msg.includes("public.contracts") ||
    msg.includes("public.export_progress")
  );
}

/** 상담결과 + DB 레거시 문자열 뱃지 색 */
function statusPillClass(status: string) {
  switch (status) {
    case "신규":
      return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800/30 dark:text-zinc-200";
    case "상담중":
      return "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-100";
    case "부재":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-200";
    case "계약완료":
    case "확정":
    case "출고":
    case "인도완료":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "보류":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    case "취소":
      return "border-rose-200/80 bg-rose-50/90 text-rose-800/90 dark:border-rose-500/25 dark:bg-rose-950/40 dark:text-rose-200/90";
    default:
      return "border-zinc-200 bg-white text-zinc-700";
  }
}

function tempPillClass(temp: "상" | "중" | "하") {
  if (temp === "상") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (temp === "하") {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
}

function priorityPillClass(p: LeadPriority) {
  if (p === "긴급") {
    return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (p === "보류") {
    return "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200";
  }
  return "border-[var(--crm-blue)]/30 bg-[var(--crm-blue)]/10 text-[var(--crm-blue-deep)] dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-200";
}

type SortKey =
  | "latest"
  | "oldest"
  | "nextContactSoon"
  | "deliverySoon"
  | "lastContactOldest"
  | "lastContactNewest"
  | "aiPriority";

type AiRow = {
  temperature: "HOT" | "WARM" | "COLD" | "DEAD";
  urgency: "긴급" | "보통" | "여유";
  nextAction: string;
  priorityScore: number;
};

function toDateKey(isoLike: string | null | undefined) {
  if (!isoLike) return "";
  return isoLike.slice(0, 10);
}

function monthRangeKeys() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function compareDateAsc(a: string | null | undefined, b: string | null | undefined) {
  const aa = toDateKey(a);
  const bb = toDateKey(b);
  if (!aa && !bb) return 0;
  if (!aa) return 1;
  if (!bb) return -1;
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

function compareIsoAsc(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function LeadsCategoryView({
  categoryKey,
  categoryLabel,
}: {
  categoryKey: LeadCategoryKey;
  categoryLabel: string;
}) {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const safePathname = pathname ?? "/leads/new-db";
  const searchParams = useSearchParams();
  const safeSearchParams = searchParams ?? new URLSearchParams();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const { openLeadById } = useLeadDetailModal();
  const { query: searchInput, setQuery: setSearchInput } = useLeadListSearch();
  const [sortBy, setSortBy] = useState<SortKey>("latest");
  const hydratedRegRef = useRef(false);
  const [listPage, setListPage] = useState(1);
  const [createOwnerOptions, setCreateOwnerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [failReasonModal, setFailReasonModal] = useState<{
    lead: Lead;
    nextStatus: CounselingStatus;
    reason: string;
    note: string;
  } | null>(null);
  const [leadsLoadError, setLeadsLoadError] = useState<string | null>(null);
  const [aiByLeadId, setAiByLeadId] = useState<Record<string, AiRow>>({});

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLeads([]);
      setCreateOwnerOptions([]);
      setLeadsLoadError(null);
      return;
    }

    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      console.error("[Supabase config invalid]", config);
      toast.error("Supabase 설정을 확인해 주세요.");
    }

    let mounted = true;
    setLeadsLoadError(null);
    (async () => {
      try {
        await ensureSeedLeads();
        const users = await listActiveUsers({
          id: profile.userId,
          role: profile.role,
          rank: profile.rank,
          email: profile.email,
          team_name: profile.teamName,
        });
        const ownerOptions = users
          .filter((u) => !!u.id && !!u.name?.trim())
          .map((u) => ({ id: u.id, name: u.name.trim() }));
        const profileOwner =
          profile.userId && profile.name?.trim()
            ? [{ id: profile.userId, name: profile.name.trim() }]
            : [];
        if (!mounted) return;
        window.setTimeout(
          () =>
            setCreateOwnerOptions(
              profile.role === "staff"
                ? profileOwner
                : ownerOptions.length > 0
                  ? ownerOptions
                  : profileOwner
            ),
          0
        );
        const selfId = (profile.userId ?? "").trim();
        const loadedRaw = await loadLeadsFromStorage({
          role: profile.role,
          userId: selfId,
          // Pipeline tabs are always self scope, regardless of rank/team.
          visibleUserIds: selfId ? [selfId] : [],
        });
        const loaded =
          getPersonalPipelineScope({
            id: selfId,
            role: profile.role,
            rank: profile.rank,
            team_name: profile.teamName,
          }) === "self"
            ? loadedRaw.filter((l) => (l.managerUserId ?? "").trim() === selfId)
            : loadedRaw;
        console.log("[pipeline self scope]", {
          viewerId: selfId,
          viewerRole: profile.role,
          viewerRank: profile.rank ?? null,
          viewerTeam: profile.teamName ?? null,
          categoryKey,
          finalManagerUserIdFilter: selfId,
          loadedCount: loadedRaw.length,
          visibleCount: loaded.length,
        });
        if (!mounted) return;
        window.setTimeout(() => setLeads(loaded), 0);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[LeadsCategoryPage] load failed", e);
        setLeadsLoadError(msg);
        toast.error("데이터를 불러오지 못했습니다.");
        window.setTimeout(
          () =>
            setCreateOwnerOptions(
              profile.userId && profile.name?.trim()
                ? [{ id: profile.userId, name: profile.name.trim() }]
                : []
            ),
          0
        );
        window.setTimeout(() => setLeads([]), 0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading]);

  useEffect(() => {
    if (authLoading || !profile?.userId) return;
    let mounted = true;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/ai/daily-queue?userId=${encodeURIComponent(profile.userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          ok?: boolean;
          queue?: Array<{
            leadId: string;
            temperature: "HOT" | "WARM" | "COLD" | "DEAD";
            urgency: "긴급" | "보통" | "여유";
            nextAction: string;
            priorityScore: number;
          }>;
        };
        if (!mounted || !json.ok) return;
        const nextMap: Record<string, AiRow> = {};
        for (const q of json.queue ?? []) {
          nextMap[q.leadId] = {
            temperature: q.temperature,
            urgency: q.urgency,
            nextAction: q.nextAction,
            priorityScore: q.priorityScore,
          };
        }
        setAiByLeadId(nextMap);
      } catch {
        if (!mounted) return;
        setAiByLeadId({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.userId, authLoading]);

  useEffect(() => {
    if (safeSearchParams.get("create") === "1") {
      setCreateOpen(true);
      const next = new URLSearchParams(safeSearchParams.toString());
      next.delete("create");
      const q = next.toString();
      router.replace(q ? `${safePathname}?${q}` : safePathname, { scroll: false });
    }
  }, [safeSearchParams, pathname, router]);

  useEffect(() => {
    const leadIdFromQuery = safeSearchParams.get("leadId");
    if (!leadIdFromQuery || selectedLeadId === leadIdFromQuery) return;
    setSelectedLeadId(leadIdFromQuery);
    void openLeadById(leadIdFromQuery);
  }, [safeSearchParams, selectedLeadId, openLeadById]);

  const regYear = (safeSearchParams.get("regYear") ?? "").trim();
  const regMonth = (safeSearchParams.get("regMonth") ?? "").trim();

  useEffect(() => {
    hydratedRegRef.current = false;
  }, [categoryKey]);

  const setRegistrationPeriodFilter = useCallback(
    (nextYear: string, nextMonth: string) => {
      const next = new URLSearchParams(safeSearchParams.toString());
      if (nextYear) {
        next.set("regYear", nextYear);
        if (nextMonth) next.set("regMonth", nextMonth);
        else next.delete("regMonth");
      } else {
        next.delete("regYear");
        next.delete("regMonth");
      }
      const qs = next.toString();
      router.replace(qs ? `${safePathname}?${qs}` : safePathname, { scroll: false });
      try {
        if (nextYear) {
          window.localStorage.setItem(
            `nowcar_leads_reg:${categoryKey}`,
            JSON.stringify({ year: nextYear, month: nextMonth || "" })
          );
        } else {
          window.localStorage.removeItem(`nowcar_leads_reg:${categoryKey}`);
        }
      } catch {
        /* ignore */
      }
    },
    [categoryKey, pathname, router, safeSearchParams]
  );

  useEffect(() => {
    if (hydratedRegRef.current) return;
    hydratedRegRef.current = true;
    if (typeof window === "undefined") return;
    if (safeSearchParams.get("regYear") || safeSearchParams.get("regMonth")) return;
    try {
      const raw = window.localStorage.getItem(`nowcar_leads_reg:${categoryKey}`)?.trim();
      if (!raw) return;
      const o = JSON.parse(raw) as { year?: string; month?: string };
      const y = (o?.year ?? "").trim();
      if (!y) return;
      const m = (o?.month ?? "").trim();
      const next = new URLSearchParams(safeSearchParams.toString());
      next.set("regYear", y);
      if (m) next.set("regMonth", m);
      router.replace(`${safePathname}?${next.toString()}`, { scroll: false });
    } catch {
      /* ignore */
    }
  }, [categoryKey, pathname, router, safeSearchParams]);

  const byCategory = useMemo(() => {
    if (!leads) return [];
    return computeCategory(leads, categoryKey);
  }, [leads, categoryKey]);

  const prePeriodFiltered = useMemo(() => {
    const raw = searchInput.trim();
    const query = raw.toLowerCase();
    const queryDigits = raw.replace(/\D/g, "");
    const bySearch = query
      ? byCategory.filter((l) => {
          const name = l.base.name.toLowerCase();
          const phone = l.base.phone.toLowerCase();
          const phoneDigits = l.base.phone.replace(/\D/g, "");
          if (name.includes(query) || phone.includes(query)) return true;
          if (queryDigits.length >= 2 && phoneDigits.includes(queryDigits)) return true;
          return false;
        })
      : byCategory;

    const todayKey = toDateKey(new Date().toISOString());
    const fromDash = safeSearchParams.get("fromDash");
    let listForDash = bySearch;

    if (categoryKey === "new-db" && fromDash === "todayNew") {
      listForDash = listForDash.filter((l) => toDateKey(l.createdAt) === todayKey);
    }
    if (categoryKey === "new-db" && fromDash === "staleNew") {
      listForDash = listForDash.filter((l) => daysAgo(l.createdAt) >= 3);
    }
    if (categoryKey === "counseling-progress" && fromDash === "todayFollow") {
      listForDash = listForDash.filter((l) => l.nextContactAt && isToday(l.nextContactAt));
    }
    if (categoryKey === "counseling-progress" && fromDash === "todayCounseling") {
      listForDash = listForDash.filter((l) => toDateKey(l.statusUpdatedAt) === todayKey);
    }
    if (categoryKey === "contract-progress" && fromDash === "monthContract") {
      const { from, to } = monthRangeKeys();
      listForDash = listForDash.filter((l) => {
        const k = toDateKey(l.statusUpdatedAt);
        if (!k) return false;
        return k >= from && k <= to;
      });
    }
    if (
      (categoryKey === "counseling-progress" || categoryKey === "quote-sent") &&
      fromDash === "stale7"
    ) {
      listForDash = listForDash.filter((l) => {
        if (l.counselingStatus === "취소") return false;
        if (
          isContractPipelineCounselingStatus(l.counselingStatus) &&
          (l.exportProgress?.stage === "인도 완료" ||
            l.deliveredAt ||
            l.counselingStatus === "인도완료")
        ) {
          return false;
        }
        return daysAgo(l.lastHandledAt) >= 7;
      });
    }
    if (categoryKey === "export-progress" && fromDash === "deliveryDue") {
      listForDash = listForDash.filter((l) => isDeliveryDueSoon(l));
    }

    return listForDash;
  }, [byCategory, searchInput, searchParams, categoryKey]);
  const yearBuckets = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of prePeriodFiltered) {
      const d = new Date(l.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const y = String(d.getFullYear());
      m.set(y, (m.get(y) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [prePeriodFiltered]);
  const monthBuckets = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of prePeriodFiltered) {
      const d = new Date(l.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [prePeriodFiltered]);
  const afterPeriodFiltered = useMemo(() => {
    let list = prePeriodFiltered;
    if (regYear) {
      list = list.filter((l) => {
        const d = new Date(l.createdAt);
        return !Number.isNaN(d.getTime()) && String(d.getFullYear()) === regYear;
      });
    }
    if (regMonth) {
      list = list.filter((l) => {
        const d = new Date(l.createdAt);
        if (Number.isNaN(d.getTime())) return false;
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        if (mm !== regMonth) return false;
        if (regYear && String(d.getFullYear()) !== regYear) return false;
        return true;
      });
    }
    return list;
  }, [prePeriodFiltered, regYear, regMonth]);

  const monthBucketsScoped = useMemo(() => {
    if (!regYear) return monthBuckets;
    return monthBuckets.filter(([k]) => k.startsWith(`${regYear}-`));
  }, [monthBuckets, regYear]);

  const filtered = useMemo(() => {
    return afterPeriodFiltered.slice().sort((a, b) => {
      if (sortBy === "latest") return a.createdAt < b.createdAt ? 1 : -1;
      if (sortBy === "oldest") return a.createdAt > b.createdAt ? 1 : -1;
      if (sortBy === "nextContactSoon") return compareDateAsc(a.nextContactAt, b.nextContactAt);
      if (sortBy === "lastContactOldest")
        return compareIsoAsc(lastContactReferenceIso(a), lastContactReferenceIso(b));
      if (sortBy === "lastContactNewest")
        return compareIsoAsc(lastContactReferenceIso(b), lastContactReferenceIso(a));
      if (sortBy === "aiPriority") {
        const as = aiByLeadId[a.id]?.priorityScore ?? -1;
        const bs = aiByLeadId[b.id]?.priorityScore ?? -1;
        if (as === bs) return a.createdAt < b.createdAt ? 1 : -1;
        return bs - as;
      }
      const aDelivery = a.exportProgress?.expectedDeliveryDate ?? a.contract?.pickupPlannedAt ?? null;
      const bDelivery = b.exportProgress?.expectedDeliveryDate ?? b.contract?.pickupPlannedAt ?? null;
      return compareDateAsc(aDelivery, bDelivery);
    });
  }, [afterPeriodFiltered, sortBy, aiByLeadId]);

  const canExportDeliveredExcel = profile?.role === "admin";

  useEffect(() => {
    setListPage(1);
  }, [searchInput, sortBy, categoryKey, pathname, regYear, regMonth]);

  const safeListPage = Math.min(Math.max(1, listPage), crmTotalPages(filtered.length, CRM_LIST_PAGE_SIZE));
  const pagedFiltered = useMemo(
    () => crmSlicePage(filtered, safeListPage, CRM_LIST_PAGE_SIZE),
    [filtered, safeListPage]
  );

  useEffect(() => {
    setListPage((p) => Math.min(Math.max(1, p), crmTotalPages(filtered.length, CRM_LIST_PAGE_SIZE)));
  }, [filtered.length]);

  const handleDeliveryExcelDownload = useCallback(async () => {
    if (profile?.role !== "admin") {
      toast.error("관리자만 엑셀 다운로드가 가능합니다.");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    const res = await fetch("/api/admin/delivered-export-permission", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("관리자만 엑셀 다운로드가 가능합니다.");
      return;
    }
    const delivered = filtered.filter((l) => l.counselingStatus === "인도완료");
    const rows = delivered.map((l) => ({
      "고객명": l.base.name,
      "연락처": l.base.phone,
      "담당자": l.base.ownerStaff,
      "차량명": l.contract?.vehicleName || l.base.desiredVehicle,
      "계약일": formatDateOnlyForExcel(l.contract?.contractDate ?? ""),
      "인도일": formatDateOnlyForExcel(l.deliveredAt ?? l.exportProgress?.deliveredAt ?? ""),
      "보증금": l.base.depositOrPrepaymentAmount || "",
      "계약기간": l.base.contractTerm || "",
    }));
    downloadXlsxRows(rows, "완료고객", `delivered_customers_${todayYmdKst()}`);
    toast.success("인도완료 고객 엑셀 다운로드가 완료되었습니다.");
  }, [profile?.role, filtered]);

  const automation = useMemo(() => {
    if (!leads) return null;
    return computeAutomationCounts(leads);
  }, [leads]);

  const todayFollowUpsInList = useMemo(
    () => filtered.filter((l) => l.nextContactAt && isToday(l.nextContactAt)),
    [filtered]
  );

  function commitLeads(next: Lead[]) {
    setLeads(next);
  }

  function handleOpenLeadDetail(lead: Lead) {
    setSelectedLeadId(lead.id);
    void openLeadById(lead.id);
  }

  async function commitCounselingStatus(row: Lead, nextStatus: CounselingStatus, fr?: string, note?: string) {
    const nextIso = new Date().toISOString();
    const next: Lead = {
      ...row,
      counselingStatus: nextStatus,
      statusUpdatedAt: nextIso,
      updatedAt: nextIso,
      lastHandledAt: nextIso,
      ...(requiresFailureReasonStatus(nextStatus)
        ? {
            failureReason: fr ?? row.failureReason ?? "",
            failureReasonNote: note ?? row.failureReasonNote ?? "",
          }
        : {}),
    };
    await handleUpdateLead(next);
  }

  async function handleUpdateLead(next: Lead, options?: { syncConsultations?: boolean }) {
    const persistPayloadLog = {
      id: next.id,
      counselingStatus: next.counselingStatus,
      counselingRecordsCount: Array.isArray(next.counselingRecords)
        ? next.counselingRecords.length
        : "not-array",
      hasContract: next.contract != null,
      hasExport: next.exportProgress != null,
      lastRecordPreview:
        Array.isArray(next.counselingRecords) && next.counselingRecords[0]
          ? {
              id: next.counselingRecords[0].id,
              occurredAt: next.counselingRecords[0].occurredAt,
              method: next.counselingRecords[0].method,
            }
          : null,
    };
    devLog("[handleUpdateLead] persist payload (summary)", persistPayloadLog);
    devLog("[handleUpdateLead] 저장 직전 전체 payload", next);
    try {
      if (!profile) throw new Error("로그인이 필요합니다.");
      if (profile.role === "staff") {
        const myName = profile.name?.trim() ?? "";
        if (next.managerUserId != null && next.managerUserId !== profile.userId) {
          toast.error("담당 직원은 본인만 지정할 수 있습니다.");
          throw new Error("담당 직원은 본인만 지정할 수 있습니다.");
        }
        if (myName && next.base.ownerStaff?.trim() !== myName) {
          toast.error("담당 직원은 본인만 지정할 수 있습니다.");
          throw new Error("담당 직원은 본인만 지정할 수 있습니다.");
        }
      }
      const payload =
        profile.role === "staff"
          ? applyStaffLeadClientLocks(next, { userId: profile.userId, name: profile.name })
          : next;
      await updateLead(payload, {
        role: "staff",
        userId: profile.userId,
      }, options);
      const refreshed = await loadLeadsFromStorage({
        role: profile.role,
        userId: profile.userId,
        visibleUserIds: profile.userId ? [profile.userId] : [],
      });
      commitLeads(refreshed.filter((l) => (l.managerUserId ?? "").trim() === (profile.userId ?? "")));
      toast.success("저장 완료되었습니다.");
      const nextPath = pathnameAfterCounselingStatusChange(next.counselingStatus, categoryKey);
      if (pathname !== nextPath) {
        router.push(nextPath);
      }
    } catch (error) {
      console.error("[handleUpdateLead] 저장 오류", formatSupabaseError(error), error, next);
      if (isMissingRelationTableError(error)) {
        toast.error("운영 DB 테이블이 준비되지 않아 저장할 수 없습니다.");
      } else {
        toast.error(error instanceof Error ? error.message : "저장하지 못했습니다.");
      }
      throw error;
    }
  }

  async function handleDeleteLead(id: string) {
    try {
      if (!profile) return;
      await deleteLeadById(id, {
        role: "staff",
        userId: profile.userId,
      });
      commitLeads((leads ?? []).filter((l) => l.id !== id));
      setSelectedLeadId(null);
      toast.success("고객을 삭제했습니다.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "고객 삭제 중 오류가 발생했습니다.";
      console.error("[LeadsCategoryPage] delete failed:", err);
      toast.error(message);
      throw err;
    }
  }

  async function handleCreateLead(next: Lead): Promise<Lead> {
    if (!profile) throw new Error("로그인이 필요합니다.");
    const normalized =
      profile.role === "staff"
        ? applyStaffLeadClientLocks(next, { userId: profile.userId, name: profile.name })
        : next;
    console.log("[LeadsCategoryPage] quick create payload(full)", normalized);

    let created: Lead;
    try {
      created = await createLead(normalized, {
        role: "staff",
        userId: profile.userId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "고객 저장 중 오류가 발생했습니다.";
      console.error("[LeadsCategoryPage] create failed(full)", {
        errorMessage: message,
        raw: err,
      });
      toast.error(message);
      throw err;
    }

    console.log("[quick-create] success after leads insert");
    commitLeads([created, ...(leads ?? [])]);
    setCreateOpen(false);
    toast.success("고객이 등록되었습니다.");
    // 등록 성공 이후 목록 재조회가 실패해도 생성 성공 상태는 유지한다.
    void (async () => {
      try {
        const refreshed = await loadLeadsFromStorage({
          role: profile.role,
          userId: profile.userId,
          visibleUserIds: profile.userId ? [profile.userId] : [],
        });
        commitLeads(refreshed.filter((l) => (l.managerUserId ?? "").trim() === (profile.userId ?? "")));
      } catch (refreshErr) {
        console.error("[LeadsCategoryPage] post-create refresh failed (non-blocking)", refreshErr);
      }
    })();
    return created;
  }

  return (
    <div className="crm-card">
      <div className="space-y-6 p-6 sm:p-7 lg:p-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            고객 단계
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {categoryLabel}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            단계는 왼쪽 사이드바만 사용합니다. 표에서{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">상담결과</span>를 바꾸면 저장 후 해당 단계
            목록으로 자동 이동합니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              전체{" "}
              <strong className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                <AnimatedStatNumber value={byCategory.length} duration={0.45} />
              </strong>
              건
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span>
              표시{" "}
              <strong className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                <AnimatedStatNumber value={filtered.length} duration={0.45} />
              </strong>
              건
            </span>
            {searchInput.trim() ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>검색 적용</span>
              </>
            ) : null}
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span>
              {automation ? (
                <>
                  전체 오늘 재연락{" "}
                  <strong className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    <AnimatedStatNumber value={automation.todayFollowUp} duration={0.5} />
                  </strong>
                  건
                </>
              ) : (
                "로딩 중…"
              )}
            </span>
            {todayFollowUpsInList.length > 0 ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                  이 목록 중 오늘 재연락 {todayFollowUpsInList.length}건
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {categoryKey === "delivery-complete" && canExportDeliveredExcel ? (
            <TapButton
              type="button"
              onClick={() => void handleDeliveryExcelDownload()}
              className="rounded-xl border border-emerald-600/80 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              엑셀 다운로드
            </TapButton>
          ) : null}
          <TapButton type="button" onClick={() => setCreateOpen(true)} className="crm-btn-primary shrink-0 self-start">
            고객 추가
          </TapButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/90 bg-[linear-gradient(180deg,#f8fbff,#f1f6fc)] p-5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/25">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            정렬
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            단계는 사이드바에서만 바꿉니다. 여기서는 목록 순서만 조정합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">정렬 기준</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="crm-field crm-field-select min-w-[200px]"
          >
            <option value="lastContactOldest">최근 연락 · 오래된 순</option>
            <option value="lastContactNewest">최근 연락 · 최신 순</option>
            <option value="aiPriority">AI 우선순위 · 높은 순</option>
            <option value="latest">등록일 · 최신순</option>
            <option value="oldest">등록일 · 오래된순</option>
            <option value="nextContactSoon">다음 연락일 빠른순</option>
            <option value="deliverySoon">인도예정일 빠른순</option>
          </select>
          <TapButton
            type="button"
            onClick={() => {
              setSearchInput("");
              setSortBy("latest");
              setListPage(1);
              setRegistrationPeriodFilter("", "");
            }}
            className="crm-btn-secondary"
          >
            검색·정렬·등록일 필터 초기화
          </TapButton>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/90 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              등록일(created_at) 필터
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              검색·단계·대시보드 조건을 먼저 반영한 뒤, 등록 연·월로 좋합니다. 건수는 아래 목록과 동일합니다.
            </p>
          </div>
          <TapButton
            type="button"
            onClick={() => setRegistrationPeriodFilter("", "")}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold",
              !regYear && !regMonth
                ? "border-[var(--crm-blue)] bg-[var(--crm-blue)]/15 text-[var(--crm-blue-deep)] dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-100"
                : "crm-btn-secondary"
            )}
          >
            전체 보기
          </TapButton>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">연도별</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {yearBuckets.length === 0 ? (
              <span className="text-xs text-zinc-400">표시할 연도가 없습니다.</span>
            ) : (
              yearBuckets.map(([y, n]) => {
                const active = regYear === y && !regMonth;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() =>
                      active ? setRegistrationPeriodFilter("", "") : setRegistrationPeriodFilter(y, "")
                    }
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-[var(--crm-blue)] bg-[var(--crm-blue)]/15 text-[var(--crm-blue-deep)] dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-100"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:border-zinc-600"
                    )}
                  >
                    {y}년 ({n})
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            월별{regYear ? ` · ${regYear}년` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {monthBucketsScoped.length === 0 ? (
              <span className="text-xs text-zinc-400">
                {regYear ? "해당 연도에 등록일이 있는 고객이 없습니다." : "표시할 월이 없습니다."}
              </span>
            ) : (
              monthBucketsScoped.map(([key, n]) => {
                const [yy, mm] = key.split("-");
                const monthNum = Number(mm);
                const active = regYear === yy && regMonth === mm;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      active ? setRegistrationPeriodFilter(yy, "") : setRegistrationPeriodFilter(yy, mm)
                    }
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-[var(--crm-blue)] bg-[var(--crm-blue)]/15 text-[var(--crm-blue-deep)] dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-100"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:border-zinc-600"
                    )}
                  >
                    {yy}년 {Number.isFinite(monthNum) ? `${monthNum}월` : mm} ({n})
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {todayFollowUpsInList.length > 0 ? (
        <div
          className="rounded-lg border border-zinc-300/90 bg-zinc-100/80 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900/50"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              오늘 재연락 예정 ·{" "}
              <span className="tabular-nums">{todayFollowUpsInList.length}</span>건
              <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
                (현재 단계·검색·대시보드 링크 조건 반영)
              </span>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
            {todayFollowUpsInList.slice(0, 12).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => handleOpenLeadDetail(l)}
                  className="rounded-md underline-offset-2 hover:underline"
                >
                  {l.base.name}
                </button>
                <span className="text-zinc-500 dark:text-zinc-500"> · {l.base.ownerStaff}</span>
              </li>
            ))}
            {todayFollowUpsInList.length > 12 ? (
              <li className="text-zinc-500">외 {todayFollowUpsInList.length - 12}명…</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {leadsLoadError ? (
        <div
          className="rounded-lg border border-rose-200/90 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-100"
          role="alert"
        >
          목록을 불러오는 중 오류가 났습니다. 빈 목록으로 표시합니다. ({leadsLoadError})
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200/90 shadow-[0_14px_32px_rgba(15,23,42,0.08)] dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">고객</th>
                <th className="px-4 py-3 font-medium">원하는 차종</th>
                <th className="px-4 py-3 font-medium">유입/유형</th>
                <th className="px-4 py-3 font-medium">고객 온도</th>
                <th className="px-4 py-3 font-medium">우선순위</th>
                <th className="px-4 py-3 font-medium">심사</th>
                <th className="px-4 py-3 font-medium">상담결과</th>
                <th className="px-4 py-3 font-medium">다음 연락</th>
                <th className="px-4 py-3 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {!leads ? (
                <LeadTableSkeleton rows={8} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-500">
                    <div className="font-medium text-zinc-700 dark:text-zinc-300">데이터가 없습니다.</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {searchInput.trim()
                        ? "검색어를 바꿔 보세요."
                        : "이 단계에 등록된 고객이 없습니다."}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedFiltered.map((row) => {
                  const ai = aiByLeadId[row.id];
                  const isTodayFollowUp = !!row.nextContactAt && isToday(row.nextContactAt);
                  const isNewOverdue = categoryKey === "new-db" && row.counselingStatus === "신규" && daysAgo(row.createdAt) >= 3;
                  const isDeliverySoon =
                    categoryKey === "export-progress" && isDeliveryDueSoon(row);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-zinc-100 transition-all duration-180 ease-out last:border-0 hover:bg-[#edf3ff] hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)] dark:border-zinc-800/80 dark:hover:bg-zinc-800/55",
                        isTodayFollowUp && "bg-zinc-50/90 dark:bg-zinc-900/35"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-50">{row.base.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">{row.base.phone}</div>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-200">
                            담당: {row.base.ownerStaff}
                          </span>
                          {isTodayFollowUp ? (
                            <span className="rounded-md border border-zinc-400 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-900 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-50">
                              오늘 재연락 예정
                            </span>
                          ) : null}
                          {isNewOverdue ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                              3일 이상 미처리
                            </span>
                          ) : null}
                          {row.contract?.deliveryType ? (
                            <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-200">
                              {row.contract.deliveryType}
                            </span>
                          ) : null}
                          {isDeliverySoon ? (
                            <span className="rounded-full border border-[var(--crm-blue)]/40 bg-[var(--crm-blue)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--crm-blue-deep)] dark:text-sky-200">
                              출고 예정 임박
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{row.base.desiredVehicle}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{row.base.customerType}</div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.base.source}</div>
                      </td>
                      <td className="px-4 py-3">
                        {ai ? (
                          <span className="inline-flex items-center rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                            {ai.temperature === "HOT"
                              ? "🔥 HOT"
                              : ai.temperature === "WARM"
                                ? "🟡 WARM"
                                : ai.temperature === "COLD"
                                  ? "🔵 COLD"
                                  : "⚫ DEAD"}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                              tempPillClass(row.base.leadTemperature)
                            )}
                          >
                            {row.base.leadTemperature}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ai ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                              {ai.priorityScore}점 · {ai.urgency}
                            </span>
                            <div className="max-w-[220px] truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                              {ai.nextAction}
                            </div>
                          </div>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                              priorityPillClass(row.leadPriority ?? "일반")
                            )}
                          >
                            {row.leadPriority ?? "일반"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
                        {categoryKey === "contract-progress" ? (
                          <span className="rounded-md border border-[var(--crm-blue)]/25 bg-[var(--crm-blue)]/5 px-2 py-1 font-medium">
                            {row.creditReviewStatus ?? "심사 전"}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.counselingStatus}
                          onChange={(e) => {
                            const nextStatus = e.target.value as CounselingStatus;
                            if (requiresFailureReasonStatus(nextStatus)) {
                              const fr = row.failureReason?.trim() ?? "";
                              if (
                                !fr ||
                                (fr === "기타" && !(row.failureReasonNote ?? "").trim())
                              ) {
                                setFailReasonModal({
                                  lead: row,
                                  nextStatus,
                                  reason: (FAILURE_REASON_OPTIONS as readonly string[]).includes(fr)
                                    ? fr
                                    : "",
                                  note: row.failureReasonNote ?? "",
                                });
                                return;
                              }
                            }
                            void commitCounselingStatus(row, nextStatus).catch(() => {
                              toast.error("저장하지 못했습니다.");
                            });
                          }}
                          className={cn(
                            "w-full max-w-[210px] cursor-pointer rounded-full border px-2 py-1 text-xs font-semibold outline-none transition-colors",
                            statusPillClass(row.counselingStatus)
                          )}
                          aria-label="상담결과 변경"
                        >
                          {CONSULT_RESULT_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s === "인도완료" ? "인도 완료" : s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {row.nextContactAt ? (
                          <div className="flex flex-col">
                            <div
                              className={cn(
                                "text-sm font-medium",
                                isTodayFollowUp ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-200"
                              )}
                            >
                              {row.nextContactAt.slice(0, 10)}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              {isTodayFollowUp ? (
                                <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                                  오늘
                                </span>
                              ) : null}
                              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400 max-w-[220px]">
                                {row.nextContactMemo || "-"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-500 dark:text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <TapButton
                            type="button"
                            onClick={() => handleOpenLeadDetail(row)}
                            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            상세
                          </TapButton>
                          <TapButton
                            type="button"
                            onClick={() => {
                              const ok = window.confirm(`${row.base.name} 고객을 삭제할까요?`);
                              if (!ok) return;
                              void handleDeleteLead(row.id);
                            }}
                            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          >
                            삭제
                          </TapButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {leads && filtered.length > 0 ? (
          <CrmListPaginationBar
            page={safeListPage}
            total={filtered.length}
            onPageChange={setListPage}
          />
        ) : null}
      </div>
      </div>

      {failReasonModal ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]"
            onClick={() => setFailReasonModal(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="crm-modal-panel max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fail-reason-title"
            >
              <div id="fail-reason-title" className="text-sm font-semibold text-[var(--crm-accent)] dark:text-zinc-50">
                실패 사유 입력
              </div>
              <p className="mt-1 text-xs text-[var(--crm-accent-muted)] dark:text-zinc-400">
                상담결과를 {failReasonModal.nextStatus}(으)로 저장합니다. 사유를 선택해 주세요.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">실패 사유</label>
                <select
                  value={failReasonModal.reason}
                  onChange={(e) =>
                    setFailReasonModal((m) => (m ? { ...m, reason: e.target.value } : m))
                  }
                  className="crm-field crm-field-select"
                >
                  <option value="">선택</option>
                  {FAILURE_REASON_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  상세 (기타 시 필수)
                </label>
                <textarea
                  value={failReasonModal.note}
                  onChange={(e) =>
                    setFailReasonModal((m) => (m ? { ...m, note: e.target.value } : m))
                  }
                  rows={3}
                  className="crm-field resize-none"
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setFailReasonModal(null)} className="crm-btn-secondary">
                  닫기
                </button>
                <button
                  type="button"
                  className="crm-btn-primary"
                  onClick={() => {
                    const r = failReasonModal.reason.trim();
                    if (!r) {
                      toast.error("실패 사유를 선택해 주세요.");
                      return;
                    }
                    if (r === "기타" && !failReasonModal.note.trim()) {
                      toast.error("기타 선택 시 상세 내용을 입력해 주세요.");
                      return;
                    }
                    const m = failReasonModal;
                    setFailReasonModal(null);
                    void commitCounselingStatus(m.lead, m.nextStatus, r, m.note).catch(() => {
                      toast.error("저장하지 못했습니다.");
                    });
                  }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {createOpen ? (
        <LeadCreateModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreateLead}
          ownerOptions={createOwnerOptions}
          defaultOwnerId={profile?.userId}
          defaultOwner={profile?.name}
          categoryKey={categoryKey}
          categoryLabel={categoryLabel}
          canAssignOwner={profile?.role === "admin" || profile?.role === "super_admin"}
          lockedOwnerDisplayName={profile?.name ?? ""}
        />
      ) : null}

    </div>
  );
}

export default function LeadsCategoryPage(props: {
  categoryKey: LeadCategoryKey;
  categoryLabel: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="crm-card p-6 sm:p-8">
          <div className="mb-4 h-6 w-48 animate-pulse rounded-lg bg-zinc-200/90 dark:bg-zinc-700/60" />
          <div className="space-y-3 rounded-lg border border-zinc-200/90 p-4 dark:border-zinc-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 w-full animate-pulse rounded-md bg-gradient-to-r from-zinc-200/90 via-zinc-100/80 to-zinc-200/90 dark:from-zinc-700/70 dark:via-zinc-600/50 dark:to-zinc-700/70"
              />
            ))}
          </div>
        </div>
      }
    >
      <LeadsCategoryView {...props} />
    </Suspense>
  );
}
