"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import GlobalLeadSearch from "./GlobalLeadSearch";

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

type NavSectionKey = "home" | "pipeline" | "work" | "admin";

type NavItem = {
  label: string;
  href: string;
  description: string;
  section: NavSectionKey;
};

type ShellUser = {
  name: string;
  role: "admin" | "manager" | "staff";
  /** 표시용 (예: 관리자 / 매니저 / 직원) */
  roleLabel?: string;
  email?: string;
};

const APP_NAME = "나우카 고객관리";

const NAV_ITEMS: NavItem[] = [
  {
    section: "home",
    label: "HOME",
    href: "/dashboard",
    description: "오늘 현황과 자동 알림을 한눈에 확인합니다.",
  },
  {
    section: "pipeline",
    label: "신규",
    href: "/leads/new-db",
    description: "진행 단계 · 신규 디비",
  },
  {
    section: "pipeline",
    label: "상담 진행 고객",
    href: "/leads/counseling-progress",
    description: "진행 단계 · 상담 중",
  },
  {
    section: "pipeline",
    label: "재연락 예정 고객",
    href: "/leads/follow-up",
    description: "진행 단계 · 다음 연락 일정",
  },
  {
    section: "pipeline",
    label: "부재/미응답 고객",
    href: "/leads/unresponsive",
    description: "진행 단계 · 연락 일정 없음",
  },
  {
    section: "pipeline",
    label: "견적 발송 고객",
    href: "/leads/quote-sent",
    description: "진행 단계 · 견적 후 회신 대기",
  },
  {
    section: "pipeline",
    label: "계약 진행 고객",
    href: "/leads/contract-progress",
    description: "진행 단계 · 체결·확정",
  },
  {
    section: "pipeline",
    label: "출고 진행 고객",
    href: "/leads/export-progress",
    description: "진행 단계 · 발주~인도 전",
  },
  {
    section: "pipeline",
    label: "인도 완료 고객",
    href: "/leads/delivery-complete",
    description: "진행 단계 · 인도 완료",
  },
  {
    section: "pipeline",
    label: "사후관리 고객",
    href: "/leads/aftercare",
    description: "진행 단계 · 인도 후 3개월+",
  },
  {
    section: "work",
    label: "근태 관리",
    href: "/attendance",
    description: "출근·퇴근 및 근태 현황",
  },
  {
    section: "admin",
    label: "직원 관리",
    href: "/employees",
    description: "승인 대기 · 계정 생성 (관리자)",
  },
];

type NavSection = {
  key: NavSectionKey;
  title: string;
  subtitle?: string;
  items: NavItem[];
};

const SECTION_META: Record<
  NavSectionKey,
  { title: string; subtitle?: string }
> = {
  home: { title: "", subtitle: undefined },
  pipeline: {
    title: "진행 단계",
    subtitle: "계약·출고 파이프라인 (상담결과와 별도)",
  },
  work: { title: "업무", subtitle: undefined },
  admin: { title: "관리", subtitle: undefined },
};

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
  return (
    <Link href={item.href} onClick={onNavigate} className="relative block rounded-xl outline-none">
      <motion.div
        className={cn(
          "group relative overflow-hidden rounded-xl py-2.5 pl-3 pr-2.5 transition-colors",
          active
            ? "bg-gradient-to-r from-sky-500/18 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22),0_1px_12px_rgba(15,23,42,0.25)]"
            : "text-slate-300 hover:bg-white/[0.06]"
        )}
        whileHover={{ x: active ? 0 : 4 }}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
      >
        {active ? (
          <motion.span
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-300 to-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.45)]"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
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
    const hit = NAV_ITEMS.find(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`)
    );
    return hit?.href ?? "";
  }, [pathname]);

  const visibleNavSections = useMemo((): NavSection[] => {
    const visible = NAV_ITEMS.filter((i) =>
      i.href === "/employees" ? currentUser?.role === "admin" : true
    );
    const order: NavSectionKey[] = ["home", "pipeline", "work", "admin"];
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
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 pb-4 pt-5">
        <div className="flex items-center gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1e3a5f] text-[11px] font-bold tracking-tight text-white shadow-lg ring-1 ring-white/10">
            나
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-tight text-white">
              {APP_NAME}
            </div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
              B2B CRM · 운영 콘솔
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
            <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
              <div className="flex min-h-[52px] flex-col gap-2 px-4 py-2 sm:px-6 lg:h-14 lg:flex-row lg:items-center lg:gap-4 lg:px-8 lg:py-0">
                <div className="flex items-center gap-3 lg:contents">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-900 lg:hidden"
                    aria-label="사이드바 열기"
                  >
                    <Icon name="menu" className="size-5" />
                  </button>

                  <div className="min-w-0 flex-1 lg:max-w-[220px] lg:flex-none">
                    <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">
                      {APP_NAME}
                    </div>
                    <div className="truncate text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                      {currentUser
                        ? `${currentUser.name} · ${currentUser.roleLabel ?? currentUser.role}`
                        : "고객 · 상담 · 계약 · 출고 통합 운영"}
                    </div>
                    {currentUser?.email ? (
                      <div className="truncate text-[10px] text-slate-400 dark:text-zinc-500 lg:hidden">
                        {currentUser.email}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full flex-1 lg:hidden">
                  <GlobalLeadSearch
                    variant="header"
                    value={leadSearchQuery}
                    onChange={setLeadSearchQuery}
                    className="w-full"
                  />
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 lg:ml-auto">
                  {onLogout ? (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="crm-btn-secondary px-3 py-1.5 text-xs"
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
            </header>

            <main className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </LeadListSearchContext.Provider>
  );
}
