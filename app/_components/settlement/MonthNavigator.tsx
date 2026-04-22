"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  currentMonth: string;
};

function moveMonth(currentMonth: string, delta: number): string {
  const [y, m] = currentMonth.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthNavigator({ currentMonth }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const changeMonth = (delta: number) => {
    const newMonth = moveMonth(currentMonth, delta);
    const nextParams = new URLSearchParams(params?.toString() ?? "");
    nextParams.set("month", newMonth);
    router.push(`${pathname}?${nextParams.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => changeMonth(-1)}>
        ◀
      </button>
      <span className="px-2 text-sm font-semibold">{currentMonth}</span>
      <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => changeMonth(1)}>
        ▶
      </button>
    </div>
  );
}
