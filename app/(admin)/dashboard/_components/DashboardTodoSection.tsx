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
    <div className="flex h-full min-h-[280px] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-zinc-800/80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">{title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-slate-600 dark:text-zinc-400">{subtitle}</p>
          </div>
          <Link
            href={href}
            className="shrink-0 text-[13px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
          >
            전체 보기
          </Link>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-2 pb-2 pt-1 sm:px-3">
        {loading ? <ListSkeleton /> : null}
        {!loading && empty ? (
          <div className="flex flex-1 items-center justify-center px-3 py-10">
            <p className="text-center text-[14px] font-medium text-slate-600 dark:text-zinc-300">{emptyHint}</p>
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
        "flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
        "hover:bg-slate-50 dark:hover:bg-zinc-900/70"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{name}</div>
        <div className="mt-0.5 text-[13px] text-slate-600 dark:text-zinc-400">{detail}</div>
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-500">
        {formatPhoneMasked(lead.base.phone)}
      </span>
    </button>
  );
}

export default function DashboardTodoSection({
  loading,
  todayLeads,
  recentAdded,
  recentCounseling,
  unresponsiveCount,
  onSelectLead,
}: {
  loading: boolean;
  todayLeads: Lead[];
  recentAdded: Lead[];
  recentCounseling: Lead[];
  /** 부재 메뉴로 안내용 (0이면 링크 숨김) */
  unresponsiveCount: number;
  onSelectLead: (id: string) => void;
}) {
  return (
    <section aria-label="오늘 할 일과 최근 활동">
      <div className="mb-4">
        <h2 className="text-[16px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">오늘 할 일 · 최근 활동</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
          오늘 연락, 막 등록된 고객, 최근 상담 접점을 빠르게 이어갑니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <TodoCard
          title="오늘 연락 예정"
          subtitle="오늘 다시 확인할 고객"
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
          title="최근 등록 고객"
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
        <TodoCard
          title="최근 상담 고객"
          subtitle="상담·처리·연락 기준 최근 접점 순"
          href="/leads/counseling-progress"
          loading={loading}
          empty={recentCounseling.length === 0}
          emptyHint="표시할 고객이 없습니다."
        >
          <ul className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {recentCounseling.map((lead) => (
              <li key={lead.id}>
                <LeadTodoRow
                  lead={lead}
                  detail={lead.counselingStatus || "상태 미지정"}
                  onSelect={onSelectLead}
                />
              </li>
            ))}
          </ul>
        </TodoCard>
      </div>
      {!loading && unresponsiveCount > 0 ? (
        <p className="mt-4 text-center text-[14px] text-slate-600 dark:text-zinc-400">
          <Link
            href="/leads/unresponsive"
            className="font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
          >
            부재 · 미응답 고객 {unresponsiveCount}건 정리하기
          </Link>
        </p>
      ) : null}
    </section>
  );
}
