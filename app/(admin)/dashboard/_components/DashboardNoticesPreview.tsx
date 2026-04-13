"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listNotices } from "../../_lib/leaseCrmSupabase";
import type { Notice } from "../../_lib/leaseCrmTypes";
import type { AuthProfile } from "../../_lib/authSupabase";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatNoticeDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function DashboardNoticesPreview({
  profile,
  variant = "featured",
  className,
}: {
  profile: AuthProfile | null;
  /** featured: 그라데이션 강조 · panel: KPI 3단과 동일한 흰 카드 */
  variant?: "featured" | "panel";
  className?: string;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listNotices(3);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  const shell =
    variant === "panel"
      ? cn(
          "crm-card overflow-hidden"
        )
      : cn(
          "overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-gradient-to-b from-white to-slate-50/80 shadow-[var(--crm-shadow-md)] dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-950/95"
        );

  return (
    <section className={cn(shell, variant === "panel" && "flex min-h-[320px] flex-col", className)} aria-label="공지사항">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 dark:border-zinc-800/80",
          variant === "panel"
            ? "border-slate-100 dark:border-zinc-800/80"
            : "border-slate-200/80 dark:border-zinc-800/80"
        )}
      >
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">공지사항</h2>
          <p className="mt-0.5 text-[14px] text-slate-600 dark:text-zinc-400">회사 운영 소식 · 최신 3건</p>
        </div>
        <Link
          href="/notices"
          className="text-[15px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
        >
          전체 보기
        </Link>
      </div>

      <div className={cn("p-4 sm:p-5", variant === "panel" && "flex flex-1 flex-col")}>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((k) => (
              <div key={k} className="crm-skeleton crm-skeleton-shimmer h-20 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-slate-600 dark:text-zinc-400">등록된 공지가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notices/${n.id}`}
                  className={cn(
                    "block rounded-xl border border-slate-200/90 bg-white p-4 transition-[transform,box-shadow,border-color,background-color] duration-220",
                    "hover:-translate-y-[3px] hover:border-[var(--crm-blue)]/25 hover:shadow-[0_20px_40px_rgba(15,23,42,0.1)]",
                    "hover:bg-[#eff5ff]",
                    "dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-sky-500/30",
                    n.isPinned && "border-[var(--crm-blue)]/35 bg-[#f4f7fc] dark:border-sky-500/40 dark:bg-sky-950/20",
                    n.isImportant && !n.isPinned && "border-amber-200/80 bg-amber-50/50 dark:border-amber-500/25 dark:bg-amber-500/5"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {n.isPinned ? (
                      <span className="rounded-full bg-[var(--crm-blue-deep)] px-2 py-0.5 text-[11px] font-bold text-white dark:bg-sky-600">
                        고정
                      </span>
                    ) : null}
                    {n.isImportant ? (
                      <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-[11px] font-bold text-amber-950 dark:bg-amber-500/25 dark:text-amber-100">
                        중요
                      </span>
                    ) : null}
                    <span className="text-[16px] font-semibold text-slate-900 dark:text-zinc-50">{n.title}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
                    {n.content}
                  </p>
                  <p className="mt-2 text-[14px] text-slate-500 dark:text-zinc-500">{formatNoticeDate(n.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
