"use client";

import Link from "next/link";
import type { Lead } from "../../_lib/leaseCrmTypes";
import { formatPhoneMasked } from "./dashboardUtils";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-3 py-3">
          <span className="h-12 flex-1 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
        </li>
      ))}
    </ul>
  );
}

function TodoCard({
  title,
  subtitle,
  href,
  loading,
  empty,
  emptyHint,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  loading: boolean;
  empty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white shadow-[var(--crm-shadow-sm)] dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-zinc-800/80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">{title}</h3>
            <p className="mt-1 text-[14px] leading-snug text-slate-600 dark:text-zinc-400">{subtitle}</p>
          </div>
          <Link
            href={href}
            className="shrink-0 text-[14px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
          >
            전체 보기
          </Link>
        </div>
      </div>
      <div className="flex-1 px-2 pb-2 pt-1 sm:px-3">
        {loading ? <ListSkeleton /> : null}
        {!loading && empty ? (
          <div className="px-3 py-10 text-center">
            <p className="text-[14px] font-medium text-slate-600 dark:text-zinc-300">{emptyHint}</p>
          </div>
        ) : null}
        {!loading && !empty ? children : null}
      </div>
    </div>
  );
}

function LeadTodoRow({
  lead,
  detail,
  onSelect,
}: {
  lead: Lead;
  detail: string;
  onSelect: (id: string) => void;
}) {
  const name = lead.base.name?.trim() || "이름 없음";
  return (
    <button
      type="button"
      onClick={() => onSelect(lead.id!)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
        "hover:bg-slate-50 dark:hover:bg-zinc-900/70"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{name}</div>
        <div className="mt-0.5 text-[14px] text-slate-600 dark:text-zinc-400">{detail}</div>
      </div>
      <span className="shrink-0 text-[13px] tabular-nums text-slate-500 dark:text-zinc-500">
        {formatPhoneMasked(lead.base.phone)}
      </span>
    </button>
  );
}

export default function DashboardTodoSection({
  loading,
  todayLeads,
  staleUnresponsive,
  recentAdded,
  onSelectLead,
}: {
  loading: boolean;
  todayLeads: Lead[];
  staleUnresponsive: Lead[];
  recentAdded: Lead[];
  onSelectLead: (id: string) => void;
}) {
  return (
    <section aria-label="오늘 할 일">
      <div className="mb-4">
        <h2 className="text-[16px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">오늘 할 일 · 알림</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
          연락 일정, 미응답, 막 들어온 고객까지 한 번에 확인합니다.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <TodoCard
          title="오늘 연락 예정"
          subtitle="다음 연락일이 오늘인 담당 고객"
          href="/leads/counseling-progress?fromDash=todayFollow"
          loading={loading}
          empty={todayLeads.length === 0}
          emptyHint="오늘 연락 예정인 고객이 없습니다."
        >
          <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {todayLeads.map((lead) => (
              <li key={lead.id}>
                <LeadTodoRow
                  lead={lead}
                  detail={(lead.nextContactMemo ?? "").trim() || lead.base.desiredVehicle?.trim() || "일정 연락"}
                  onSelect={onSelectLead}
                />
              </li>
            ))}
          </ul>
        </TodoCard>
        <TodoCard
          title="오래된 미응답"
          subtitle="부재 상태 중, 마지막 접촉 시점이 오래된 순"
          href="/leads/unresponsive"
          loading={loading}
          empty={staleUnresponsive.length === 0}
          emptyHint="표시할 부재 고객이 없습니다."
        >
          <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {staleUnresponsive.map((lead) => (
              <li key={lead.id}>
                <LeadTodoRow
                  lead={lead}
                  detail={lead.base.desiredVehicle?.trim() || "차종 미입력"}
                  onSelect={onSelectLead}
                />
              </li>
            ))}
          </ul>
        </TodoCard>
        <TodoCard
          title="최근 추가된 고객"
          subtitle="등록일 최신순 · 빠르게 이어서 응대"
          href="/leads/new-db"
          loading={loading}
          empty={recentAdded.length === 0}
          emptyHint="최근 등록된 고객이 없습니다."
        >
          <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {recentAdded.map((lead) => (
              <li key={lead.id}>
                <LeadTodoRow
                  lead={lead}
                  detail={lead.base.desiredVehicle?.trim() || "차종 미입력"}
                  onSelect={onSelectLead}
                />
              </li>
            ))}
          </ul>
        </TodoCard>
      </div>
    </section>
  );
}
