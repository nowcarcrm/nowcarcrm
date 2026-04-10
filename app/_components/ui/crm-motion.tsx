"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import CountUp from "react-countup";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function TapButton({
  className = "",
  children,
  type = "button",
  ...props
}: HTMLMotionProps<"button">) {
  return (
    <motion.button
      type={type}
      whileTap={props.disabled ? undefined : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function HoverCard({ className = "", children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedStatNumber({
  value,
  className,
  duration = 0.55,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      <CountUp end={value} duration={duration} preserveValue />
    </span>
  );
}

export function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-gradient-to-r from-zinc-200/90 via-zinc-100/90 to-zinc-200/90 dark:from-zinc-700/80 dark:via-zinc-600/60 dark:to-zinc-700/80",
        className
      )}
    />
  );
}

export function AttendancePanelSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200/80 bg-white/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
        >
          <ShimmerBlock className="mb-2 h-3 w-16" />
          <ShimmerBlock className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function LeadTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/80">
          <td className="px-4 py-3" colSpan={9}>
            <div className="flex flex-wrap items-center gap-3">
              <ShimmerBlock className="h-4 w-28" />
              <ShimmerBlock className="h-4 w-36" />
              <ShimmerBlock className="h-4 w-20" />
              <ShimmerBlock className="ml-auto h-8 w-16 rounded-md" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
