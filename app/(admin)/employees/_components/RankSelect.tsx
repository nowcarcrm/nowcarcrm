"use client";

import { rankSelectOptions } from "../../_lib/rankConfig";
import type { UserRank } from "../../_lib/rolePermissions";

export default function RankSelect({
  value,
  disabled,
  isSuperAdmin,
  onChange,
}: {
  value: string | null | undefined;
  disabled?: boolean;
  isSuperAdmin: boolean;
  onChange: (next: UserRank | "") => void;
}) {
  const options = rankSelectOptions(isSuperAdmin);
  const safeValue = options.includes(value as UserRank) ? (value as UserRank) : "";
  return (
    <select
      className="max-w-[9.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      disabled={disabled}
      value={safeValue}
      onChange={(e) => onChange((e.target.value as UserRank) || "")}
    >
      <option value="">직급 미설정</option>
      {options.map((rank) => (
        <option key={rank} value={rank}>
          {rank}
        </option>
      ))}
    </select>
  );
}
