"use client";

import RankBadge from "@/app/(admin)/employees/_components/RankBadge";
import { getRankBadgeMeta, normalizeRank } from "@/app/(admin)/_lib/rankConfig";

export default function UserRankCard({
  name,
  rank,
  className = "",
  size = "hero",
}: {
  name: string;
  rank?: string | null;
  className?: string;
  size?: "hero" | "header";
}) {
  const meta = getRankBadgeMeta(rank);
  const rankLabel = normalizeRank(rank) ?? "직급 미설정";
  const highlight =
    meta && meta.priority >= 70
      ? "ring-1 ring-white/60 shadow-[0_14px_38px_rgba(76,29,149,0.15)]"
      : meta && meta.priority >= 50
        ? "ring-1 ring-white/50 shadow-[0_12px_30px_rgba(37,99,235,0.12)]"
        : "shadow-[0_10px_24px_rgba(15,23,42,0.08)]";
  const isHeader = size === "header";

  return (
    <div
      className={`rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-gradient-to-br ${
        isHeader ? "p-3.5" : "p-6"
      } transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-[1px] dark:border-zinc-800 dark:bg-zinc-900 ${
        meta ? meta.cardAccentClass : "from-white to-slate-50"
      } ${highlight} ${className}`}
    >
      <div className={isHeader ? "text-[14px] font-semibold text-slate-900 dark:text-zinc-100" : "text-[20px] font-semibold text-slate-900 dark:text-zinc-100"}>
        {name}
      </div>
      <div className={isHeader ? "mt-1 flex flex-wrap items-center gap-1.5" : "mt-3 text-[15px] font-medium text-slate-700 dark:text-zinc-200"}>
        <span>{rankLabel}</span>
      </div>
      <div className={isHeader ? "mt-1" : "mt-3"}>
        <RankBadge rank={rank} />
      </div>
    </div>
  );
}
