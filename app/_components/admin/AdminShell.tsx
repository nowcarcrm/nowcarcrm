"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import GlobalLeadSearch from "./GlobalLeadSearch";
import CrmPageTransition from "../motion/CrmPageTransition";
import toast from "react-hot-toast";
import LeadDetailModal from "@/app/(admin)/leads/_components/LeadDetailModal";
import type { Lead } from "@/app/(admin)/_lib/leaseCrmTypes";
import { fetchLeadById } from "@/app/(admin)/_lib/leaseCrmSupabase";
import {
  applyStaffLeadClientLocks,
  deleteLeadById,
  updateLead,
} from "@/app/(admin)/_lib/leaseCrmStorage";
import { pathnameAfterCounselingStatusChange } from "@/app/(admin)/_lib/leaseCrmLogic";
import { listActiveUsers } from "@/app/(admin)/_lib/usersSupabase";
import AiCounselAssistPopup from "@/app/(admin)/leads/_components/AiCounselAssistPopup";

type LeadListSearchContextValue = {
  query: string;
  setQuery: (q: string) => void;
};

const LeadListSearchContext = createContext<LeadListSearchContextValue | null>(null);
type LeadDetailModalContextValue = {
  openLeadById: (leadId: string) => Promise<void>;
  openLead: (lead: Lead) => void;
  closeLead: () => void;
};
const LeadDetailModalContext = createContext<LeadDetailModalContextValue | null>(null);

export function useLeadListSearch() {
  const ctx = useContext(LeadListSearchContext);
  if (!ctx) {
    return { query: "", setQuery: () => {} };
  }
  return ctx;
}

export function useLeadDetailModal() {
  const ctx = useContext(LeadDetailModalContext);
  if (!ctx) {
    return {
      openLeadById: async () => {},
      openLead: () => {},
      closeLead: () => {},
    };
  }
  return ctx;
}

type NavSectionKey = "sales" | "operations";

type NavItem = {
  label: string;
  href: string;
  description: string;
  section: NavSectionKey;
  /** 관리자만 사이드바에 표시 */
  adminOnly?: boolean;
};

type ShellUser = {
  /** public.users.id (레거시 스키마와 동일 목적) */
  userId: string;
  name: string;
  role: "super_admin" | "admin" | "staff";
  /** 표시용 (예: 관리자 / 매니저 / 직원) */
  roleLabel?: string;
  position?: string;
  email?: string;
};

const APP_NAME = "NOWCAR";
const APP_SUBTITLE = "CRM";

const NAV_ITEMS: NavItem[] = [
  {
    section: "sales",
    label: "대시보드",
    href: "/dashboard",
    description: "지표·오늘 할 일 (본인 담당)",
  },
  {
    section: "sales",
    label: "신규",
    href: "/leads/new-db",
    description: "상담결과 · 신규",
  },
  {
    section: "sales",
    label: "상담중",
    href: "/leads/counseling-progress",
    description: "상담결과 · 상담 진행 중",
  },
  {
    section: "sales",
    label: "부재",
    href: "/leads/unresponsive",
    description: "상담결과 · 미응답·부재",
  },
  {
    section: "sales",
    label: "계약",
    href: "/leads/contract-progress",
    description: "계약완료·확정 (출고 전)",
  },
  {
    section: "sales",
    label: "인도완료",
    href: "/leads/delivery-complete",
    description: "상담결과 · 인도 완료",
  },
  {
    section: "sales",
    label: "보류",
    href: "/leads/hold",
    description: "상담결과 · 재개 가능",
  },
  {
    section: "sales",
    label: "취소",
    href: "/leads/cancel",
    description: "상담결과 · 종료",
  },
  {
    section: "sales",
    label: "근태 관리",
    href: "/attendance",
    description: "출근·퇴근 및 근태 현황",
  },
  {
    section: "operations",
    label: "공지사항",
    href: "/notices",
    description: "회사 공지 · 고정·중요 표시",
  },
  {
    section: "operations",
    label: "전체 상담 고객",
    href: "/operations/all-customers",
    description: "전사 고객 · 인수인계·백업 (관리자)",
    adminOnly: true,
  },
  {
    section: "operations",
    label: "직원 현황",
    href: "/operations/staff-overview",
    description: "직원별 진행·실적 집계 (관리자)",
    adminOnly: true,
  },
  {
    section: "operations",
    label: "직원 관리",
    href: "/employees",
    description: "승인 대기 · 계정 생성 (관리자)",
    adminOnly: true,
  },
];

type NavSection = {
  key: NavSectionKey;
  title: string;
  subtitle?: string;
  items: NavItem[];
};

const SECTION_META: Record<NavSectionKey, { title: string; subtitle?: string }> = {
  sales: {
    title: "영업",
    subtitle: "본인 담당 고객만 집계·목록에 표시됩니다",
  },
  operations: {
    title: "운영 / 관리자",
    subtitle: undefined,
  },
};

/** 긴 경로를 먼저 두어 prefix 매칭이 겹치지 않게 함 */
const PAGE_TITLE_ROUTES: { prefix: string; title: string }[] = [
  { prefix: "/leads/counseling-progress", title: "상담중" },
  { prefix: "/leads/contract-progress", title: "계약" },
  { prefix: "/leads/delivery-complete", title: "인도완료" },
  { prefix: "/leads/unresponsive", title: "부재" },
  { prefix: "/leads/hold", title: "보류" },
  { prefix: "/leads/cancel", title: "취소" },
  { prefix: "/leads/quote-sent", title: "견적 발송 고객" },
  { prefix: "/leads/follow-up", title: "재연락 예정 고객" },
  { prefix: "/leads/new-db", title: "신규 고객" },
  { prefix: "/leads/aftercare", title: "사후관리 고객" },
  { prefix: "/operations/staff-overview", title: "직원 현황" },
  { prefix: "/operations/staff", title: "직원 담당 고객" },
  { prefix: "/operations/all-customers", title: "전체 상담 고객" },
  { prefix: "/dashboard", title: "대시보드" },
  { prefix: "/notices", title: "공지사항" },
  { prefix: "/counseling", title: "상담" },
  { prefix: "/attendance", title: "근태 관리" },
  { prefix: "/employees", title: "직원 관리" },
];

function titleForPathname(pathname: string | null): string {
  if (!pathname) return "대시보드";
  const p = pathname.replace(/\/$/, "") || "/";
  const hit = PAGE_TITLE_ROUTES.find((x) => p === x.prefix || p.startsWith(`${x.prefix}/`));
  return hit?.title ?? "NOWCAR CRM";
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Icon({
  name,
  className,
}: {
  name: "menu" | "close" | "bell";
  className?: string;
}) {
  if (name === "menu") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M4 6h16M4 12h16M4 18h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M6 6l12 12M18 6 6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M15 17H9a2 2 0 0 1-2-2V10a5 5 0 1 1 10 0v5a2 2 0 0 1-2 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SidebarNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <Link href={item.href} onClick={onNavigate} className="relative block rounded-xl outline-none">
      <motion.div
        className={cn(
          "group relative overflow-hidden rounded-2xl py-4 pl-4 pr-3.5 transition-all duration-250 ease-out",
          active
            ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),0_12px_28px_rgba(2,6,23,0.4)]"
            : "text-slate-300 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_10px_20px_rgba(2,6,23,0.2)]"
        )}
        whileHover={reduce || active ? undefined : { x: 5, y: -1 }}
        whileTap={{ scale: 0.986 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {active ? (
          <motion.span
            layoutId="sidebar-active-bar"
              className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-300 to-sky-500 shadow-[0_0_14px_rgba(56,189,248,0.45)]"
            transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden
          />
        ) : (
          <span
            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-white/0 transition-colors group-hover:bg-white/15"
            aria-hidden
          />
        )}
        <div className="relative min-w-0 pl-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-[15px] leading-snug tracking-tight",
                active ? "font-semibold text-white" : "font-semibold text-slate-200"
              )}
            >
              {item.label}
            </span>
            {active ? (
              <span className="hidden rounded-full bg-sky-500/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm sm:inline">
                현재
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-1 truncate text-[12px] leading-snug",
              active ? "text-slate-200/95" : "text-slate-500 group-hover:text-slate-300"
            )}
          >
            {item.description}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}

function SidebarContents({
  onNavigate,
  currentUser,
  onLogout,
  searchValue,
  onSearchChange,
}: {
  onNavigate?: () => void;
  currentUser?: ShellUser;
  onLogout?: () => void;
  searchValue: string;
  onSearchChange: (q: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const showAdminManagerFilter =
    (currentUser?.role === "super_admin" || currentUser?.role === "admin") &&
    (pathname?.startsWith("/operations/all-customers") ?? false);

  useEffect(() => {
    if (!showAdminManagerFilter) return;
    let mounted = true;
    (async () => {
      const users = await listActiveUsers();
      if (!mounted) return;
      setStaffOptions(users.map((u) => ({ id: u.id, name: u.name?.trim() || "이름없음" })));
    })();
    return () => {
      mounted = false;
    };
  }, [showAdminManagerFilter]);

  useEffect(() => {
    if (!showAdminManagerFilter) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const fromQuery = sp.get("managerUserId") ?? "";
    const fromStorage = window.localStorage.getItem("crm.admin.managerUserId") ?? "";
    const next = fromQuery || fromStorage;
    setSelectedUserId(next);
    if (!fromQuery && next) {
      const url = new URL(window.location.href);
      url.searchParams.set("managerUserId", next);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
  }, [showAdminManagerFilter, pathname]);
  const activeHref = useMemo(() => {
    if (!pathname) return "";
    const p = pathname.replace(/\/$/, "") || "/";
    let best = "";
    for (const i of NAV_ITEMS) {
      if (p === i.href || p.startsWith(`${i.href}/`)) {
        if (i.href.length > best.length) best = i.href;
      }
    }
    return best;
  }, [pathname]);

  const visibleNavSections = useMemo((): NavSection[] => {
    /** 관리자 전용 메뉴: users.role 이 정확히 "admin" 일 때만 (DB·프로필 불일치 시 운영에서 숨겨질 수 있음) */
    const visible = NAV_ITEMS.filter((i) => {
      if (i.adminOnly && currentUser?.role !== "admin" && currentUser?.role !== "super_admin") return false;
      return true;
    });
    const order: NavSectionKey[] = ["sales", "operations"];
    const out: NavSection[] = [];
    for (const key of order) {
      const items = visible.filter((i) => i.section === key);
      if (items.length === 0) continue;
      const meta = SECTION_META[key];
      const section: NavSection = { key, title: meta.title, items };
      if (meta.subtitle !== undefined) section.subtitle = meta.subtitle;
      out.push(section);
    }
    return out;
  }, [currentUser?.role]);

  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="border-b border-white/10 px-5 pb-4 pt-6">
        <div className="flex items-center gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#2f7cff] to-[#1f4e9b] text-[10px] font-extrabold tracking-tight text-white shadow-[0_10px_20px_rgba(3,13,34,0.35)] ring-1 ring-white/20">
            NC
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-extrabold tracking-tight text-white">{APP_NAME}</div>
            <div className="mt-0.5 truncate text-[12px] font-medium text-slate-300">
              {APP_SUBTITLE} · 리스·렌트 운영 콘솔
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5">
        <GlobalLeadSearch
          variant="sidebar"
          value={searchValue}
          onChange={onSearchChange}
          className="w-full"
        />
        {showAdminManagerFilter ? (
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              담당 직원 필터
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedUserId(nextId);
                if (typeof window === "undefined") return;
                const url = new URL(window.location.href);
                if (nextId) {
                  url.searchParams.set("managerUserId", nextId);
                  window.localStorage.setItem("crm.admin.managerUserId", nextId);
                } else {
                  url.searchParams.delete("managerUserId");
                  window.localStorage.removeItem("crm.admin.managerUserId");
                }
                router.push(`${url.pathname}${url.search}`, { scroll: false });
              }}
              className="crm-field crm-field-select w-full text-[13px]"
            >
              <option value="">전체 직원</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-5">
        <LayoutGroup id="crm-sidebar-nav">
          {visibleNavSections.map((section, sIdx) => (
            <motion.div
              key={section.key}
              className="pt-7 first:pt-1"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sIdx * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {section.title ? (
                <div className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {section.title}
                </div>
              ) : null}
              {section.subtitle ? (
                <div className="mt-1 px-2.5 text-[11px] leading-snug text-slate-500/95">
                  {section.subtitle}
                </div>
              ) : null}
              <div className={cn("space-y-1", section.title || section.subtitle ? "mt-2.5" : "")}>
                {section.items.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    item={item}
                    active={item.href === activeHref}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </LayoutGroup>
      </nav>

      <div className="mt-auto border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/20 bg-white/[0.08] p-4 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.35)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            세션
          </div>
          <div className="mt-2 text-[13px] font-semibold text-white">
            {currentUser ? currentUser.name : "—"}
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-slate-400">
            {currentUser
              ? `권한 · ${currentUser.roleLabel ?? currentUser.role}`
              : "미로그인"}
          </div>
          {currentUser?.position ? (
            <div className="mt-1 text-[11px] font-medium text-slate-300">직급 · {currentUser.position}</div>
          ) : null}
          {onLogout ? (
            <button type="button" onClick={onLogout} className="crm-btn-secondary mt-3 w-full py-2 text-xs">
              로그아웃
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({
  children,
  currentUser,
  onLogout,
}: {
  children: React.ReactNode;
  currentUser?: ShellUser;
  onLogout?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pageTitle = titleForPathname(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [modalLead, setModalLead] = useState<Lead | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const leadSearchValue = useMemo(
    () => ({ query: leadSearchQuery, setQuery: setLeadSearchQuery }),
    [leadSearchQuery]
  );
  const modalScope = useMemo(() => {
    if (!currentUser) return null;
    if (
      (currentUser.role === "super_admin" || currentUser.role === "admin") &&
      pathname?.startsWith("/operations")
    ) {
      return {
        role: "admin" as const,
        userId: currentUser.userId,
        operationalFullAccess: true,
      };
    }
    return { role: currentUser.role, userId: currentUser.userId };
  }, [currentUser, pathname]);

  const modalValue = useMemo<LeadDetailModalContextValue>(
    () => ({
      openLeadById: async (leadId: string) => {
        if (!modalScope) return;
        setModalLoading(true);
        try {
          const lead = await fetchLeadById(leadId, modalScope);
          if (!lead) {
            toast.error("고객을 찾을 수 없거나 권한이 없습니다.");
            return;
          }
          setModalLead(lead);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "고객 정보를 불러오지 못했습니다.");
        } finally {
          setModalLoading(false);
        }
      },
      openLead: (lead: Lead) => setModalLead(lead),
      closeLead: () => setModalLead(null),
    }),
    [modalScope]
  );

  return (
    <LeadListSearchContext.Provider value={leadSearchValue}>
      <LeadDetailModalContext.Provider value={modalValue}>
        <div className="min-h-dvh bg-[var(--crm-canvas)] dark:bg-zinc-950">
        <div className="mx-auto flex min-h-dvh w-full max-w-[1920px]">
          {/* Desktop sidebar */}
          <aside className="relative hidden w-[316px] shrink-0 border-r border-[var(--crm-border-strong)] bg-[linear-gradient(180deg,#0a1f3f_0%,#0d2b56_50%,#081a33_100%)] shadow-[12px_0_36px_-14px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-[#081426] dark:shadow-none lg:block">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(147,197,253,0.18),transparent_45%)]" aria-hidden />
            <SidebarContents
              currentUser={currentUser}
              onLogout={onLogout}
              searchValue={leadSearchQuery}
              onSearchChange={setLeadSearchQuery}
            />
          </aside>

          {/* Mobile sidebar drawer */}
          {mobileOpen ? (
            <div className="lg:hidden">
              <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
              />
              <aside className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[320px] border-r border-[var(--crm-border-strong)] bg-[#0f2847] shadow-[8px_0_40px_-12px_rgba(15,23,42,0.2)]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-semibold text-white">메뉴</div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg p-2 text-slate-200 hover:bg-white/10"
                    aria-label="사이드바 닫기"
                  >
                    <Icon name="close" className="size-5" />
                  </button>
                </div>
                <SidebarContents
                  onNavigate={() => setMobileOpen(false)}
                  currentUser={currentUser}
                  onLogout={onLogout}
                  searchValue={leadSearchQuery}
                  onSearchChange={setLeadSearchQuery}
                />
              </aside>
            </div>
          ) : null}

          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-slate-200/85 bg-white/92 shadow-[0_8px_26px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
              <div className="px-4 py-3.5 sm:px-6 lg:px-8">
                <div className="relative flex flex-wrap items-center gap-3 sm:gap-4 lg:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-900 lg:hidden"
                    aria-label="사이드바 열기"
                  >
                    <Icon name="menu" className="size-5" />
                  </button>

                  <Link
                    href="/dashboard"
                    className="flex min-w-0 max-w-[55%] items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-blue)]/35 focus-visible:ring-offset-2 sm:max-w-none lg:min-w-[200px] lg:max-w-[280px]"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--crm-blue-deep)] text-[10px] font-extrabold tracking-tight text-white shadow-sm dark:bg-[#163a5e]">
                      NC
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-50">
                        {APP_NAME}
                        <span className="ml-1.5 text-[14px] font-semibold text-slate-500 dark:text-zinc-400">
                          {APP_SUBTITLE}
                        </span>
                      </span>
                      <span className="mt-0.5 hidden truncate text-[13px] font-medium text-slate-500 dark:text-zinc-500 lg:block">
                        리스·렌트 통합 운영
                      </span>
                    </span>
                  </Link>

                  <div className="order-last hidden w-full flex-1 justify-center lg:order-none lg:flex">
                    <h1 className="text-[21px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">
                      {pageTitle}
                    </h1>
                  </div>

                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2 lg:min-w-0 lg:flex-1">
                    <Link
                      href="/leads/new-db?create=1"
                      className="crm-btn-primary whitespace-nowrap px-3 py-2 text-[14px] sm:px-4"
                    >
                      고객 추가
                    </Link>
                    <Link
                      href="/leads/counseling-progress"
                      className="hidden whitespace-nowrap rounded-xl border border-slate-300/90 bg-white px-3.5 py-2.5 text-[14px] font-semibold text-slate-800 shadow-[var(--crm-shadow-sm)] transition-[border-color,background,box-shadow,transform] hover:-translate-y-[1px] hover:border-[var(--crm-blue)]/40 hover:bg-slate-50 hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)] sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                    >
                      상담 기록
                    </Link>
                    <div className="hidden flex-col items-end text-right md:flex">
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100">
                        {currentUser?.name ?? "—"}
                      </span>
                      <span className="text-[13px] text-slate-500 dark:text-zinc-400">
                        {currentUser
                          ? `${currentUser.roleLabel ?? currentUser.role}${currentUser.position ? ` · ${currentUser.position}` : ""}`
                          : ""}
                      </span>
                    </div>
                    {onLogout ? (
                      <button
                        type="button"
                        onClick={onLogout}
                        className="crm-btn-secondary whitespace-nowrap px-3 py-2 text-[14px]"
                      >
                        로그아웃
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        aria-label="알림"
                      >
                        <Icon name="bell" className="size-5" />
                      </button>
                    )}
                  </div>
                </div>

                <h1 className="mt-3 text-[17px] font-semibold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100 lg:hidden">
                  {pageTitle}
                </h1>

                <div className="mt-3 lg:hidden">
                  <GlobalLeadSearch
                    variant="header"
                    value={leadSearchQuery}
                    onChange={setLeadSearchQuery}
                    className="w-full"
                  />
                </div>
              </div>
            </header>

            <main className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
                <CrmPageTransition>{children}</CrmPageTransition>
              </div>
            </main>
          </div>
        </div>
          {modalLoading ? (
            <div className="fixed inset-0 z-[55] grid place-items-center bg-black/20 text-sm font-medium text-slate-700 dark:text-zinc-200">
              불러오는 중…
            </div>
          ) : null}
          {modalLead && modalScope ? (
            <LeadDetailModal
              lead={modalLead}
              onClose={() => setModalLead(null)}
              onUpdate={async (next, options) => {
                const payload =
                  modalScope.role === "staff"
                    ? applyStaffLeadClientLocks(next, {
                        userId: modalScope.userId,
                        name: currentUser?.name ?? "",
                      })
                    : next;
                await updateLead(payload, modalScope, options);
                setModalLead(payload);
                const nextPath = pathnameAfterCounselingStatusChange(payload.counselingStatus);
                if (pathname !== nextPath) router.push(nextPath);
                router.refresh();
              }}
              onDelete={(id) => {
                void (async () => {
                  try {
                    await deleteLeadById(id, modalScope);
                    setModalLead(null);
                    router.refresh();
                    toast.success("삭제되었습니다.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
                  }
                })();
              }}
            />
          ) : null}
          <AiCounselAssistPopup lead={modalLead} />
        </div>
      </LeadDetailModalContext.Provider>
    </LeadListSearchContext.Provider>
  );
}
