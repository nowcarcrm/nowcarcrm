"use client";

import Link from "next/link";

export type PipelineStageCounts = {
  newDb: number;
  counseling: number;
  contract: number;
  exportProgress: number;
  deliveryComplete: number;
};

const STAGES: {
  label: string;
  href: string;
  valueKey: keyof PipelineStageCounts;
}[] = [
  { label: "신규", href: "/leads/new-db", valueKey: "newDb" },
  { label: "상담중", href: "/leads/counseling-progress", valueKey: "counseling" },
  { label: "계약", href: "/leads/contract-progress", valueKey: "contract" },
  { label: "출고", href: "/leads/export-progress", valueKey: "exportProgress" },
  { label: "인도완료", href: "/leads/delivery-complete", valueKey: "deliveryComplete" },
];

export default function DashboardPipeline({
  loading,
  pipeline,
}: {
  loading: boolean;
  pipeline: PipelineStageCounts | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[var(--crm-shadow-sm)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">고객 흐름</h2>
          <p className="mt-1 text-[14px] text-slate-600 dark:text-zinc-400">
            진행 단계 메뉴와 동일한 규칙으로 집계했습니다.
          </p>
        </div>
        <Link
          href="/leads/new-db"
          className="text-[14px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
        >
          전체 목록
        </Link>
      </div>
      <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
        {STAGES.map((stage, idx) => (
          <div key={stage.label} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {idx > 0 ? (
              <span
                className="hidden shrink-0 text-[13px] font-medium text-slate-300 sm:inline dark:text-zinc-600"
                aria-hidden
              >
                →
              </span>
            ) : null}
            <Link
              href={stage.href}
              className="min-w-0 flex-1 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-3 text-center shadow-sm transition-[transform,background,border-color] hover:-translate-y-0.5 hover:border-[var(--crm-blue)]/30 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 sm:px-4 sm:py-4"
            >
              <div className="text-[13px] font-semibold text-slate-600 dark:text-zinc-300">{stage.label}</div>
              <div className="mt-2 tabular-nums text-[1.5rem] font-bold text-[var(--crm-blue-deep)] dark:text-sky-200 sm:text-[1.75rem]">
                {loading || !pipeline ? (
                  <span className="mx-auto block h-8 w-10 animate-pulse rounded-md bg-slate-200 dark:bg-zinc-700" />
                ) : (
                  pipeline[stage.valueKey]
                )}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
