"use client";

export const CRM_LIST_PAGE_SIZE = 10;

export function crmTotalPages(total: number, pageSize = CRM_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function crmSlicePage<T>(items: T[], page: number, pageSize = CRM_LIST_PAGE_SIZE): T[] {
  const p = Math.max(1, Math.floor(page));
  const start = (p - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function CrmListPaginationBar({
  page,
  pageSize = CRM_LIST_PAGE_SIZE,
  total,
  onPageChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}) {
  const pages = crmTotalPages(total, pageSize);
  const safe = Math.min(Math.max(1, page), pages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-[13px] dark:border-zinc-800 dark:bg-zinc-900/40">
      <span className="text-slate-600 dark:text-zinc-400">
        {"\uCD09\uAC74 "}
        <strong className="tabular-nums text-slate-900 dark:text-zinc-100">{total}</strong>
        {" \u00B7 "}
        <strong className="tabular-nums text-slate-900 dark:text-zinc-100">{safe}</strong>
        {" / "}
        <strong className="tabular-nums text-slate-900 dark:text-zinc-100">{pages}</strong>
        {" \uD398\uC774\uC9C0"}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safe <= 1}
          onClick={() => onPageChange(safe - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {"\uC774\uC804"}
        </button>
        <button
          type="button"
          disabled={safe >= pages}
          onClick={() => onPageChange(safe + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {"\uB2E4\uC74C"}
        </button>
      </div>
    </div>
  );
}
