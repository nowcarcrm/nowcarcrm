"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  COUNSELING_STATUS_OPTIONS,
  CREDIT_REVIEW_STATUS_OPTIONS,
  FAILURE_REASON_OPTIONS,
  LEAD_PRIORITY_OPTIONS,
  requiresFailureReasonStatus,
  type CounselingStatus,
  type CreditReviewStatus,
  type Lead,
  type LeadCategoryKey,
  type LeadPriority,
  type LeadTemperature,
  DELIVERY_TYPE_OPTIONS,
  type DeliveryTypeOption,
} from "../../_lib/leaseCrmTypes";
import {
  computeCategory,
  computeAutomationCounts,
  daysAgo,
  isContractPipelineCounselingStatus,
  isDeliveryDueSoon,
  isToday,
} from "../../_lib/leaseCrmLogic";
import { formatSupabaseError } from "../../_lib/leaseCrmSupabase";
import {
  createLead,
  deleteLeadById,
  ensureSeedLeads,
  loadLeadsFromStorage,
  updateLead,
} from "../../_lib/leaseCrmStorage";
import { getSupabaseConfigStatus } from "../../_lib/supabaseClient";
import LeadCreateModal from "./LeadCreateModal";
import LeadDetailModal from "./LeadDetailModal";
import { useLeadListSearch } from "@/app/_components/admin/AdminShell";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { listActiveUsers } from "../../_lib/usersSupabase";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { devLog } from "@/app/_lib/devLog";
import {
  AnimatedStatNumber,
  HoverCard,
  LeadTableSkeleton,
  TapButton,
} from "@/app/_components/ui/crm-motion";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "보류":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    case "취소":
      return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200";
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

type DateFieldKey = "createdAt" | "statusUpdatedAt" | "nextContactAt";
type DatePreset = "today" | "week" | "month" | "custom";
type SortKey =
  | "latest"
  | "oldest"
  | "nextContactSoon"
  | "deliverySoon"
  | "lastContactOldest"
  | "lastContactNewest";

/** 목록 내 추가 좁히기: 상담결과(Lead.counselingStatus). 왼쪽 메뉴 진행단계와 별도 */
type NarrowStatusKey = "all" | CounselingStatus;

const NARROW_STATUS_OPTIONS: { key: NarrowStatusKey; label: string }[] = [
  { key: "all", label: "전체" },
  ...COUNSELING_STATUS_OPTIONS.map((s) => ({ key: s as NarrowStatusKey, label: s })),
];

function toDateKey(isoLike: string | null | undefined) {
  if (!isoLike) return "";
  return isoLike.slice(0, 10);
}

function dateRangeByPreset(preset: DatePreset) {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === "today") {
    return { from: end, to: end };
  }
  if (preset === "week") {
    const d = new Date(now);
    const day = d.getDay() || 7; // 1..7
    d.setDate(d.getDate() - (day - 1));
    return { from: d.toISOString().slice(0, 10), to: end };
  }
  if (preset === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: d.toISOString().slice(0, 10), to: end };
  }
  return { from: "", to: "" };
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

/** 정렬용: 상담기록 최신 occurredAt → lastHandledAt → (기록 없으면) nextContactAt → createdAt */
function lastContactReferenceIso(lead: Lead): string {
  let maxIso = "";
  const recs = Array.isArray(lead.counselingRecords) ? lead.counselingRecords : [];
  for (const r of recs) {
    if (r.occurredAt > maxIso) maxIso = r.occurredAt;
  }
  if (lead.lastHandledAt > maxIso) maxIso = lead.lastHandledAt;
  if (!maxIso && lead.nextContactAt) maxIso = lead.nextContactAt;
  if (!maxIso) maxIso = lead.createdAt;
  return maxIso;
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
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const { query: searchInput, setQuery: setSearchInput } = useLeadListSearch();
  const [narrowStatusFilter, setNarrowStatusFilter] = useState<NarrowStatusKey>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateField, setDateField] = useState<DateFieldKey>("createdAt");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("lastContactOldest");
  const [createOwnerOptions, setCreateOwnerOptions] = useState<string[]>([]);
  const [tempFilter, setTempFilter] = useState<"all" | LeadTemperature>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | LeadPriority>("all");
  const [creditFilter, setCreditFilter] = useState<"all" | CreditReviewStatus>("all");
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState<"all" | Exclude<DeliveryTypeOption, "">>(
    "all"
  );
  const [failReasonModal, setFailReasonModal] = useState<{
    lead: Lead;
    nextStatus: CounselingStatus;
    reason: string;
    note: string;
  } | null>(null);
  const [leadsLoadError, setLeadsLoadError] = useState<string | null>(null);

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
        const users = await listActiveUsers();
        const names = users.map((u) => u.name);
        if (!mounted) return;
        window.setTimeout(
          () =>
            setCreateOwnerOptions(
              profile.role === "staff"
                ? [profile.name]
                : names.length > 0
                  ? names
                  : [profile.name]
            ),
          0
        );
        const loaded = await loadLeadsFromStorage({
          role: profile.role,
          userId: profile.userId,
        });
        if (!mounted) return;
        window.setTimeout(() => setLeads(loaded), 0);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[LeadsCategoryPage] load failed", e);
        setLeadsLoadError(msg);
        toast.error("데이터를 불러오지 못했습니다.");
        window.setTimeout(() => setCreateOwnerOptions([profile.name]), 0);
        window.setTimeout(() => setLeads([]), 0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading]);

  useEffect(() => {
    const fd = searchParams.get("fromDash");
    if (!fd) return;
    switch (fd) {
      case "todayNew":
        setDatePreset("today");
        setDateField("createdAt");
        setNarrowStatusFilter("신규");
        break;
      case "todayCounseling":
        setDatePreset("today");
        setDateField("statusUpdatedAt");
        setNarrowStatusFilter("상담중");
        break;
      case "monthContract":
        setDatePreset("month");
        setDateField("statusUpdatedAt");
        setNarrowStatusFilter("계약완료");
        break;
      case "todayFollow":
        setDatePreset("today");
        setDateField("nextContactAt");
        setNarrowStatusFilter("all");
        break;
      case "deliveryDue":
        setDatePreset("month");
        setDateField("createdAt");
        setNarrowStatusFilter("all");
        break;
      case "contractPipe":
        setDatePreset("month");
        setDateField("createdAt");
        setNarrowStatusFilter("all");
        break;
      default:
        break;
    }
  }, [searchParams]);

  const selectedLead = useMemo(() => leads?.find((l) => l.id === activeLeadId) ?? null, [leads, activeLeadId]);

  const byCategory = useMemo(() => {
    if (!leads) return [];
    return computeCategory(leads, categoryKey);
  }, [leads, categoryKey]);

  /** 담당자 필터: 활성 직원 목록 + 현재 목록에 나온 담당자 (검색 전 단계 기준) */
  const ownerFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of createOwnerOptions) {
      if (n?.trim()) set.add(n.trim());
    }
    for (const l of byCategory) {
      if (l.base.ownerStaff?.trim()) set.add(l.base.ownerStaff.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [createOwnerOptions, byCategory]);

  const filtered = useMemo(() => {
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

    const byNarrowStatus =
      narrowStatusFilter === "all"
        ? bySearch
        : bySearch.filter((l) => l.counselingStatus === narrowStatusFilter);

    const byOwner =
      ownerFilter === "all"
        ? byNarrowStatus
        : byNarrowStatus.filter((l) => l.base.ownerStaff === ownerFilter);

    const byTemp =
      tempFilter === "all"
        ? byOwner
        : byOwner.filter((l) => l.base.leadTemperature === tempFilter);

    const byPriority =
      priorityFilter === "all"
        ? byTemp
        : byTemp.filter((l) => (l.leadPriority ?? "일반") === priorityFilter);

    const byCredit =
      creditFilter === "all"
        ? byPriority
        : byPriority.filter((l) => (l.creditReviewStatus ?? "심사 전") === creditFilter);

    const byDelivery =
      deliveryTypeFilter === "all"
        ? byCredit
        : byCredit.filter((l) => (l.contract?.deliveryType ?? "") === deliveryTypeFilter);

    const range =
      datePreset === "custom"
        ? { from: customFrom, to: customTo }
        : dateRangeByPreset(datePreset);
    const rangeFrom = range.from;
    const rangeTo = range.to;

    const byDate = byDelivery.filter((l) => {
      if (!rangeFrom && !rangeTo) return true;
      const raw =
        dateField === "createdAt"
          ? l.createdAt
          : dateField === "statusUpdatedAt"
            ? l.statusUpdatedAt
            : l.nextContactAt;
      const key = toDateKey(raw);
      if (!key) return false;
      if (rangeFrom && key < rangeFrom) return false;
      if (rangeTo && key > rangeTo) return false;
      return true;
    });

    const fromDash = searchParams.get("fromDash");
    let listForDash = byDate;
    if (categoryKey === "new-db" && fromDash === "staleNew") {
      listForDash = listForDash.filter((l) => daysAgo(l.createdAt) >= 3);
    }
    if (
      (categoryKey === "counseling-progress" || categoryKey === "quote-sent") &&
      fromDash === "stale7"
    ) {
      listForDash = listForDash.filter((l) => {
        if (l.counselingStatus === "취소") return false;
        if (
          isContractPipelineCounselingStatus(l.counselingStatus) &&
          (l.exportProgress?.stage === "인도 완료" || l.deliveredAt)
        ) {
          return false;
        }
        return daysAgo(l.lastHandledAt) >= 7;
      });
    }
    if (categoryKey === "export-progress" && fromDash === "deliveryDue") {
      listForDash = listForDash.filter((l) => isDeliveryDueSoon(l));
    }

    return listForDash.slice().sort((a, b) => {
      if (sortBy === "latest") return a.createdAt < b.createdAt ? 1 : -1;
      if (sortBy === "oldest") return a.createdAt > b.createdAt ? 1 : -1;
      if (sortBy === "nextContactSoon") return compareDateAsc(a.nextContactAt, b.nextContactAt);
      if (sortBy === "lastContactOldest")
        return compareIsoAsc(lastContactReferenceIso(a), lastContactReferenceIso(b));
      if (sortBy === "lastContactNewest")
        return compareIsoAsc(lastContactReferenceIso(b), lastContactReferenceIso(a));
      const aDelivery = a.exportProgress?.expectedDeliveryDate ?? a.contract?.pickupPlannedAt ?? null;
      const bDelivery = b.exportProgress?.expectedDeliveryDate ?? b.contract?.pickupPlannedAt ?? null;
      return compareDateAsc(aDelivery, bDelivery);
    });
  }, [
    byCategory,
    searchInput,
    narrowStatusFilter,
    ownerFilter,
    datePreset,
    dateField,
    customFrom,
    customTo,
    sortBy,
    searchParams.toString(),
    categoryKey,
    tempFilter,
    priorityFilter,
    creditFilter,
    deliveryTypeFilter,
  ]);

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

  async function handleUpdateLead(next: Lead) {
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
      const payload =
        profile.role === "staff"
          ? {
              ...next,
              managerUserId: profile.userId,
              base: { ...next.base, ownerStaff: profile.name },
            }
          : next;
      await updateLead(payload, {
        role: profile.role,
        userId: profile.userId,
      });
      commitLeads((leads ?? []).map((l) => (l.id === payload.id ? payload : l)));
      toast.success("저장 완료되었습니다.");
      if (next.counselingStatus === "부재") {
        const p = pathname ?? "";
        if (!p.includes("/leads/unresponsive")) {
          router.push("/leads/unresponsive");
        }
      }
    } catch (error) {
      console.error("[handleUpdateLead] 저장 오류", formatSupabaseError(error), error, next);
      toast.error(
        error instanceof Error ? error.message : "저장하지 못했습니다."
      );
      throw error;
    }
  }

  async function handleDeleteLead(id: string) {
    try {
      if (!profile) return;
      await deleteLeadById(id, {
        role: profile.role,
        userId: profile.userId,
      });
      commitLeads((leads ?? []).filter((l) => l.id !== id));
      setActiveLeadId(null);
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
        ? {
            ...next,
            managerUserId: profile.userId,
            base: { ...next.base, ownerStaff: profile.name },
          }
        : next;
    console.log("[LeadsCategoryPage] quick create payload(full)", normalized);

    let created: Lead;
    try {
      created = await createLead(normalized, {
        role: profile.role,
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
        });
        commitLeads(refreshed);
      } catch (refreshErr) {
        console.error("[LeadsCategoryPage] post-create refresh failed (non-blocking)", refreshErr);
      }
    })();
    return created;
  }

  return (
    <div className="crm-card">
      <div className="space-y-5 p-5 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            진행단계
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {categoryLabel}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            다른 단계로 이동하려면 왼쪽 사이드바에서 메뉴를 선택하세요. 아래{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">상담결과</span>는 DB에 저장되는 상태이며,
            진행단계와는 별개로 이 목록만 좁힙니다.
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
            {narrowStatusFilter !== "all" ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>상담결과 필터</span>
              </>
            ) : null}
            {ownerFilter !== "all" ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>담당자: {ownerFilter}</span>
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
        <TapButton type="button" onClick={() => setCreateOpen(true)} className="crm-btn-primary shrink-0 self-start">
          고객 추가
        </TapButton>
      </div>

      <HoverCard className="rounded-lg border border-zinc-200/90 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/25">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            필터
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
            상담결과 칩과 드롭다운은 동일 필터입니다.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {NARROW_STATUS_OPTIONS.map((opt) => {
            const active = narrowStatusFilter === opt.key;
            return (
              <TapButton
                key={opt.key}
                type="button"
                onClick={() => setNarrowStatusFilter(opt.key)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-[var(--crm-blue-deep)] bg-[var(--crm-blue-deep)] text-white dark:border-[var(--crm-blue)] dark:bg-[var(--crm-blue)] dark:text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-[var(--crm-blue)]/30 hover:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600"
                )}
              >
                {opt.label}
              </TapButton>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">고객 온도</label>
            <select
              value={tempFilter}
              onChange={(e) => setTempFilter(e.target.value as typeof tempFilter)}
              className="crm-field crm-field-select"
            >
              <option value="all">전체</option>
              <option value="상">상</option>
              <option value="중">중</option>
              <option value="하">하</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">우선순위</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
              className="crm-field crm-field-select"
            >
              <option value="all">전체</option>
              {LEAD_PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">심사 상태</label>
            <select
              value={creditFilter}
              onChange={(e) => setCreditFilter(e.target.value as typeof creditFilter)}
              className="crm-field crm-field-select"
            >
              <option value="all">전체</option>
              {CREDIT_REVIEW_STATUS_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">출고 유형</label>
            <select
              value={deliveryTypeFilter}
              onChange={(e) =>
                setDeliveryTypeFilter(e.target.value as typeof deliveryTypeFilter)
              }
              className="crm-field crm-field-select"
            >
              <option value="all">전체</option>
              {DELIVERY_TYPE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">담당자</label>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="crm-field crm-field-select"
            >
              <option value="all">전체</option>
              {ownerFilterOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">상담결과</label>
            <select
              value={narrowStatusFilter}
              onChange={(e) => setNarrowStatusFilter(e.target.value as NarrowStatusKey)}
              className="crm-field crm-field-select"
            >
              {NARROW_STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">날짜 범위</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="crm-field crm-field-select"
            >
              <option value="today">오늘</option>
              <option value="week">이번 주</option>
              <option value="month">이번 달</option>
              <option value="custom">직접 선택</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">날짜 기준</label>
            <select
              value={dateField}
              onChange={(e) => setDateField(e.target.value as DateFieldKey)}
              className="crm-field crm-field-select"
            >
              <option value="createdAt">등록일</option>
              <option value="statusUpdatedAt">상담결과 변경일</option>
              <option value="nextContactAt">다음연락일</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">정렬</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="crm-field crm-field-select"
            >
              <option value="lastContactOldest">최근 연락 · 오래된 순</option>
              <option value="lastContactNewest">최근 연락 · 최신 순</option>
              <option value="latest">등록일 · 최신순</option>
              <option value="oldest">등록일 · 오래된순</option>
              <option value="nextContactSoon">다음 연락일 빠른순</option>
              <option value="deliverySoon">인도예정일 빠른순</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">시작일</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="crm-field"
              disabled={datePreset !== "custom"}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">종료일</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="crm-field"
              disabled={datePreset !== "custom"}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
          <TapButton
            type="button"
            onClick={() => {
              setSearchInput("");
              setNarrowStatusFilter("all");
              setOwnerFilter("all");
              setTempFilter("all");
              setPriorityFilter("all");
              setCreditFilter("all");
              setDeliveryTypeFilter("all");
              setDatePreset("month");
              setDateField("createdAt");
              setCustomFrom("");
              setCustomTo("");
              setSortBy("lastContactOldest");
            }}
            className="crm-btn-secondary"
          >
            필터 초기화
          </TapButton>
        </div>
      </HoverCard>

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
                (현재 검색·필터·담당자 조건 반영)
              </span>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
            {todayFollowUpsInList.slice(0, 12).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setActiveLeadId(l.id)}
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

      <div className="overflow-hidden rounded-lg border border-zinc-200/90 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
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
                      {searchInput.trim() || narrowStatusFilter !== "all" || ownerFilter !== "all"
                        ? "검색·필터 조건을 바꿔 보세요."
                        : "이 단계에 등록된 고객이 없습니다."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const isTodayFollowUp = !!row.nextContactAt && isToday(row.nextContactAt);
                  const isNewOverdue = categoryKey === "new-db" && row.counselingStatus === "신규" && daysAgo(row.createdAt) >= 3;
                  const isDeliverySoon =
                    categoryKey === "export-progress" && isDeliveryDueSoon(row);
                  return (
                    <motion.tr
                      key={row.id}
                      initial={false}
                      whileHover={{
                        y: -2,
                        boxShadow: "0 10px 40px -18px rgba(15, 23, 42, 0.18)",
                        transition: { type: "spring", stiffness: 420, damping: 30 },
                      }}
                      className={cn(
                        "border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80 dark:border-zinc-800/80 dark:hover:bg-zinc-900/40",
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
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                            tempPillClass(row.base.leadTemperature)
                          )}
                        >
                          {row.base.leadTemperature}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                            priorityPillClass(row.leadPriority ?? "일반")
                          )}
                        >
                          {row.leadPriority ?? "일반"}
                        </span>
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
                          {COUNSELING_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
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
                            onClick={() => setActiveLeadId(row.id)}
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
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
          defaultOwner={profile?.name}
          categoryKey={categoryKey}
          categoryLabel={categoryLabel}
          canAssignOwner={profile?.role === "admin" || profile?.role === "manager"}
          lockedOwnerDisplayName={profile?.name ?? ""}
        />
      ) : null}

      {selectedLead ? (
        <LeadDetailModal
          key={selectedLead.id}
          lead={selectedLead}
          onClose={() => setActiveLeadId(null)}
          onUpdate={handleUpdateLead}
          onDelete={(id) => void handleDeleteLead(id)}
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
