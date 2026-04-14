"use client";

import RankBadge from "@/app/(admin)/employees/_components/RankBadge";
import { getRankBadgeMeta, normalizeRank } from "@/app/(admin)/_lib/rankConfig";

export default function UserRankSummary({
  name,
  rank,
  roleLabel,
  compact = false,
}: {
  name: string;
  rank?: string | null;
  roleLabel?: string;
  compact?: boolean;
}) {
  const meta = getRankBadgeMeta(rank);
  const rankLabel = normalizeRank(rank) ?? "직급 미설정";

  return (
    <div className={compact ? "inline-flex items-center gap-2" : "space-y-1.5"}>
      <div className={compact ? "text-[14px] font-semibold text-slate-900 dark:text-zinc-100" : "text-[15px] font-bold text-slate-900 dark:text-zinc-100"}>
        {name}
      </div>
      <div className={compact ? "inline-flex items-center gap-1.5" : "flex flex-wrap items-center gap-2"}>
        <span className="text-[12px] text-slate-600 dark:text-zinc-400">{rankLabel}</span>
        <RankBadge rank={rank} />
        {roleLabel ? <span className="text-[11px] text-slate-500 dark:text-zinc-500">{roleLabel}</span> : null}
      </div>
      {!compact && meta?.description ? (
        <p className="text-[12px] text-slate-500 dark:text-zinc-400">{meta.description}</p>
      ) : null}
    </div>
  );
}
