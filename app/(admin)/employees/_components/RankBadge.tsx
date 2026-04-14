"use client";

import { RANK_CONFIG, normalizeRank } from "../../_lib/rankConfig";

export default function RankBadge({ rank }: { rank: string | null | undefined }) {
  const normalized = normalizeRank(rank);
  if (!normalized) {
    return (
      <span className="inline-flex rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
        직급 미설정
      </span>
    );
  }
  const cfg = RANK_CONFIG[normalized];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}>
      {normalized} · {cfg.tier}
    </span>
  );
}
