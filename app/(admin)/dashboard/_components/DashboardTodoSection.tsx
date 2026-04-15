"use client";

import Link from "next/link";
import { motion } from "framer-motion";
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
          <span className="crm-skeleton crm-skeleton-shimmer h-12 flex-1 rounded-lg" />
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
    <div className="crm-card flex h-full min-h-[312px] flex-col">
      <div className="border-b border-slate-200/90 px-6 py-5 dark:border-zinc-800/80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">{title}</h3>
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
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2 sm:px-4">
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
  const status = String(lead.counselingStatus ?? "").trim();
  const statusClass =
    status === "상담중"
      ? "bg-blue-100 text-blue-700"
      : status === "계약"
        ? "bg-emerald-100 text-emerald-700"
        : status === "출고"
          ? "bg-purple-100 text-purple-700"
          : status === "취소"
            ? "bg-rose-100 text-rose-700"
            : "bg-slate-100 text-slate-600";
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(lead.id!)}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-xl border border-slate-200/90 border-l-[3px] border-l-[#2563eb] bg-white/80 px-3 py-3 text-left transition-all duration-200 ease-out dark:border-zinc-700/70 dark:bg-zinc-900/30",
        "hover:bg-[#eef4ff] hover:shadow-[0_12px_22px_rgba(15,23,42,0.09)] dark:hover:bg-zinc-900/70"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{name}</div>
          {status ? (
            <span className={cn("rounded-full px-[10px] py-1 text-[12px] font-medium", statusClass)}>{status}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[13px] text-slate-600 dark:text-zinc-400">{detail}</div>
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-500">
        {formatPhoneMasked(lead.base.phone)}
      </span>
    </motion.button>
  );
}

export default function DashboardTodoSection({
  loading,
  todayLeads,
  recentAdded,
  recentCounseling,
  unresponsiveCount,
  dailyQueue,
  dailyInsight,
  onSelectLead,
}: {
  loading: boolean;
  todayLeads: Lead[];
  recentAdded: Lead[];
  recentCounseling: Lead[];
  /** 부재 메뉴로 안내용 (0이면 링크 숨김) */
  unresponsiveCount: number;
  dailyQueue: Array<{
    rank: number;
    leadId: string;
    customerName: string;
    carModel: string;
    source: string;
    temperature: "HOT" | "WARM" | "COLD" | "DEAD";
    urgency: "긴급" | "보통" | "여유";
    nextAction: string;
    priorityScore: number;
    preGeneratedMent: Record<string, unknown> | null;
  }>;
  dailyInsight: string;
  onSelectLead: (id: string) => void;
}) {
  return (
    <section aria-label="오늘 할 일과 최근 활동">
      <div className="mb-5 rounded-2xl border border-amber-200/70 bg-[linear-gradient(180deg,#fff9ef,#fff4df)] p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-[var(--crm-accent)] dark:text-zinc-50">오늘의 AI 우선순위 큐</h3>
            <p className="mt-1 text-[13px] text-slate-600 dark:text-zinc-300">
              우선 연락 고객 {dailyQueue.length}명 · 상위 순서대로 바로 실행하세요.
            </p>
          </div>
          <Link href="/leads/counseling-progress?sort=lastContactOldest" className="crm-pill-secondary text-xs">
            고객 목록 이동
          </Link>
        </div>
        {dailyQueue.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">아직 오늘 AI 큐가 생성되지 않았습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {dailyQueue.slice(0, 5).map((q) => (
              <li key={q.leadId}>
                <button
                  type="button"
                  onClick={() => onSelectLead(q.leadId)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white/85 px-3 py-2 text-left hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      #{q.rank} {q.customerName} - {q.carModel || "차종 미입력"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {q.temperature} / {q.urgency} · {q.nextAction}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {q.priorityScore}점
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {dailyInsight ? <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">🤖 {dailyInsight}</p> : null}
      </div>
      <div className="mb-4">
        <h2 className="text-[18px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">오늘 할 일 · 최근 활동</h2>
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
