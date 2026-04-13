"use client";

import Link from "next/link";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type DashboardKpiValues = {
  todayNew: number;
  counseling: number;
  contract: number;
  exportProgress: number;
  deliveryComplete: number;
  total: number;
  /**
   * 예상 수수료(원): 취소 제외, 계약 탭 수수료(스냅샷 우선) 또는 견적 이력 최신 fee 합산
   */
  expectedCommissionWon: number;
};

type Item = {
  key: string;
  label: string;
  href: string;
  valueKey: keyof DashboardKpiValues;
};

const ITEMS: Item[] = [
  { key: "today", label: "오늘 신규 고객", href: "/leads/new-db?fromDash=todayNew", valueKey: "todayNew" },
  { key: "counsel", label: "상담 중", href: "/leads/counseling-progress", valueKey: "counseling" },
  { key: "contract", label: "계약 진행", href: "/leads/contract-progress", valueKey: "contract" },
  { key: "export", label: "출고 진행", href: "/leads/export-progress", valueKey: "exportProgress" },
  { key: "delivery", label: "인도 완료", href: "/leads/delivery-complete", valueKey: "deliveryComplete" },
  { key: "total", label: "총 고객", href: "/leads/new-db", valueKey: "total" },
];

export default function DashboardKpiCards({
  loading,
  values,
}: {
  loading: boolean;
  values: DashboardKpiValues | null;
}) {
  return (
    <section aria-label="핵심 지표">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">핵심 지표</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
            로그인 직후 가장 먼저 보는 운영 숫자입니다. 카드를 누르면 해당 단계 목록으로 이동합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/leads/new-db?create=1"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--crm-blue-deep)] bg-[var(--crm-blue-deep)] px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-95 dark:border-sky-600 dark:bg-sky-600"
          >
            고객 추가
          </Link>
          <Link
            href="/leads/counseling-progress"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-800 shadow-[var(--crm-shadow-sm)] transition hover:border-[var(--crm-blue)]/35 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            상담 기록
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,border-color] duration-200",
              "hover:-translate-y-0.5 hover:border-[var(--crm-blue)]/25 hover:shadow-[0_8px_24px_rgba(15,40,71,0.1)]",
              "dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-sky-500/25"
            )}
          >
            <div className="text-[14px] font-medium text-slate-600 dark:text-zinc-400">{item.label}</div>
            <div className="mt-3 tabular-nums text-[2rem] font-bold leading-none tracking-tight text-[var(--crm-blue-deep)] dark:text-sky-200 sm:text-[2.25rem]">
              {loading || !values ? (
                <span
                  className="block h-10 w-20 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800"
                  aria-hidden
                />
              ) : (
                values[item.valueKey]
              )}
            </div>
          </Link>
        ))}
        <div
          className={cn(
            "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color] duration-200",
            "ring-1 ring-[var(--crm-blue)]/12 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-sky-500/15"
          )}
        >
          <div className="text-[14px] font-medium text-slate-600 dark:text-zinc-400">예상 수수료</div>
          <p className="mt-1 text-[13px] leading-snug text-slate-500 dark:text-zinc-500">
            취소 제외 · 계약 또는 최신 견적에 입력된 수수료 합계
          </p>
          <div className="mt-2 min-h-[2.5rem] tabular-nums text-[1.35rem] font-bold leading-tight tracking-tight text-[var(--crm-blue-deep)] dark:text-sky-200 sm:text-[1.65rem] xl:text-[1.85rem]">
            {loading || !values ? (
              <span className="block h-10 w-28 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" aria-hidden />
            ) : (
              `${new Intl.NumberFormat("ko-KR").format(values.expectedCommissionWon)}원`
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
