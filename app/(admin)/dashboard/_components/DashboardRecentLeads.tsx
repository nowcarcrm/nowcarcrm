"use client";

import Link from "next/link";
import type { Lead } from "../../_lib/leaseCrmTypes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DashboardRecentLeads({
  loading,
  leads,
  onSelect,
}: {
  loading: boolean;
  leads: Lead[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[var(--crm-shadow-sm)] dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-zinc-800/80">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--crm-accent)] dark:text-zinc-100">최근 등록 고객</h2>
          <p className="mt-1 text-[14px] text-slate-600 dark:text-zinc-400">방금 들어온 고객부터 이어서 처리하세요.</p>
        </div>
        <Link
          href="/leads/new-db"
          className="text-[14px] font-semibold text-[var(--crm-blue)] underline-offset-4 hover:underline dark:text-sky-300"
        >
          신규 목록
        </Link>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-slate-600 dark:text-zinc-400">최근 등록된 고객이 없습니다.</div>
        ) : (
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/90 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="px-5 py-3">고객</th>
                <th className="px-3 py-3">차량·문의</th>
                <th className="px-3 py-3">담당</th>
                <th className="px-5 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {leads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-slate-50/90 dark:hover:bg-zinc-900/40">
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => lead.id && onSelect(lead.id)}
                      className="text-left text-[15px] font-semibold text-[var(--crm-blue-deep)] underline-offset-2 hover:underline dark:text-sky-200"
                    >
                      {lead.base.name?.trim() || "—"}
                    </button>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-[14px] text-slate-700 dark:text-zinc-200">
                    {lead.base.desiredVehicle?.trim() || "—"}
                  </td>
                  <td className="px-3 py-3 text-[14px] text-slate-700 dark:text-zinc-200">
                    {lead.base.ownerStaff?.trim() || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-[13px] font-medium",
                        lead.counselingStatus === "신규" && "border-slate-200 bg-slate-100 text-slate-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
                        lead.counselingStatus === "상담중" && "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100",
                        lead.counselingStatus === "부재" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100",
                        !["신규", "상담중", "부재"].includes(lead.counselingStatus) &&
                          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-100"
                      )}
                    >
                      {lead.counselingStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
