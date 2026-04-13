"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import GlobalLeadSearch from "./GlobalLeadSearch";
import CrmPageTransition from "../motion/CrmPageTransition";

type LeadListSearchContextValue = {
  query: string;
  setQuery: (q: string) => void;
};

const LeadListSearchContext = createContext<LeadListSearchContextValue | null>(null);

export function useLeadListSearch() {
  const ctx = useContext(LeadListSearchContext);
  if (!ctx) {
    return { query: "", setQuery: () => {} };
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
  role: "admin" | "manager" | "staff";
  /** 표시용 (예: 관리자 / 매니저 / 직원) */
  roleLabel?: string;
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
    label: "출고",
    href: "/leads/export-progress",
    description: "상담결과 · 출고 진행",
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
  { prefix: "/leads/export-progress", title: "출고" },
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
          "group relative overflow-hidden rounded-xl py-2.5 pl-3 pr-2.5 transition-colors duration-200 ease-out",
          active
            ? "bg-gradient-to-r from-sky-500/18 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22),0_1px_12px_rgba(15,23,42,0.25)]"
            : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
        )}
        whileHover={reduce || active ? undefined : { x: 3 }}
        whileTap={{ scale: 0.987 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {active ? (
          <motion.span
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-300 to-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.45)]"
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
                "truncate text-[13px] leading-snug tracking-tight",
                active ? "font-semibold text-white" : "font-medium text-slate-200"
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
              "mt-0.5 truncate text-[11px] leading-snug",
              active ? "text-slate-200/90" : "text-slate-500 group-hover:text-slate-400"
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
  const pathname = usePathname();
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
      if (i.adminOnly && currentUser?.role !== "admin") return false;
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

  useEffect(() => {
    console.log("sidebar profile", {
      userId: currentUser?.userId,
      role: currentUser?.role,
      name: currentUser?.name,
      email: currentUser?.email,
    });
  }, [currentUser?.userId, currentUser?.role, currentUser?.name, currentUser?.email]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 pb-4 pt-5">
        <div className="flex items-center gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1e3a5f] text-[10px] font-extrabold tracking-tight text-white shadow-lg ring-1 ring-white/10">
            NC
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-tight text-white">{APP_NAME}</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
              {APP_SUBTITLE} · 리스·렌트 운영 콘솔
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <GlobalLeadSearch
          variant="sidebar"
          value={searchValue}
          onChange={onSearchChange}
          className="w-full"
        />
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-4">
        <LayoutGroup id="crm-sidebar-nav">
          {visibleNavSections.map((section, sIdx) => (
            <motion.div
              key={section.key}
              className="pt-6 first:pt-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sIdx * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {section.title ? (
                <div className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {section.title}
                </div>
              ) : null}
              {section.subtitle ? (
                <div className="mt-1 px-2.5 text-[10px] leading-snug text-slate-500">
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
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
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
  const pathname = usePathname();
  const pageTitle = titleForPathname(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const leadSearchValue = useMemo(
    () => ({ query: leadSearchQuery, setQuery: setLeadSearchQuery }),
    [leadSearchQuery]
  );

  return (
    <LeadListSearchContext.Provider value={leadSearchValue}>
      <div className="min-h-dvh bg-[var(--crm-canvas)] dark:bg-zinc-950">
        <div className="mx-auto flex min-h-dvh w-full max-w-[1920px]">
          {/* Desktop sidebar */}
          <aside className="hidden w-[288px] shrink-0 border-r border-[var(--crm-border-strong)] bg-[#0f2847] shadow-[4px_0_24px_-8px_rgba(15,23,42,0.12)] dark:border-zinc-800 dark:bg-[#0a1628] dark:shadow-none lg:block">
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
            <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-950">
              <div className="px-4 py-3 sm:px-6 lg:px-8">
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
                    <h1 className="text-[18px] font-semibold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">
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
                      className="hidden whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-800 shadow-[var(--crm-shadow-sm)] transition-[border-color,background] hover:border-[var(--crm-blue)]/40 hover:bg-slate-50 sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                    >
                      상담 기록
                    </Link>
                    <div className="hidden flex-col items-end text-right md:flex">
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100">
                        {currentUser?.name ?? "—"}
                      </span>
                      <span className="text-[13px] text-slate-500 dark:text-zinc-400">
                        {currentUser ? (currentUser.roleLabel ?? currentUser.role) : ""}
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
      </div>
    </LeadListSearchContext.Provider>
  );
}
