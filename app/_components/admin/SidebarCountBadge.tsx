"use client";

import { useEffect, useState } from "react";
import type { SidebarCountKey } from "./useSidebarCounts";

type Props = {
  count: number;
  variant: SidebarCountKey;
};

const VARIANT_STYLES: Record<SidebarCountKey, string> = {
  new: "bg-blue-500 text-white",
  counseling: "bg-amber-400 text-white",
  contract: "bg-emerald-500 text-white",
  delivered: "bg-emerald-700 text-white",
  hold: "bg-orange-500 text-white",
  cancel: "bg-gray-400 text-white",
  unresponsive: "bg-red-500 text-white",
};

export function SidebarCountBadge({ count, variant }: Props) {
  if (count <= 0) return null;

  const [prevCount, setPrevCount] = useState(count);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    if (prevCount === count) return;
    setIsChanging(true);
    const timer = window.setTimeout(() => setIsChanging(false), 300);
    setPrevCount(count);
    return () => window.clearTimeout(timer);
  }, [count, prevCount]);

  const pulseClass = variant === "unresponsive" ? "animate-pulse" : "";

  return (
    <span
      className={[
        "ml-auto inline-flex items-center justify-center rounded-full px-1.5 text-[11px] font-semibold transition-all duration-200",
        "min-w-[22px] h-[22px] sm:min-w-[22px] sm:h-[22px] max-sm:min-w-[18px] max-sm:h-[18px] max-sm:text-[9px]",
        VARIANT_STYLES[variant],
        pulseClass,
        isChanging ? "scale-110" : "scale-100",
      ].join(" ")}
      aria-label={`${count}건`}
      title={`${count}건`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
