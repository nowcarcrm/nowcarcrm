"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import CountUp from "react-countup";
import { dashboardKpiItem, dashboardKpiStagger } from "@/app/_lib/crmMotion";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type DashboardKpiValues = {
  expectedCommissionWon: number;
  confirmedCommissionThisMonthWon: number;
  thisMonthRegisteredCount: number;
  assignedCustomerCount: number;
};

/** `computePipelineStageCounts`와 동일 필드 */
export type PipelineStageCounts = {
  newDb: number;
  counseling: number;
  contract: number;
  exportProgress: number;
  deliveryComplete: number;
  hold: number;
  cancel: number;
  unresponsive: number;
  total: number;
};

function AnimatedNumber({
  value,
  suffix = "",
  loading,
  className,
}: {
  value: number;
  suffix?: string;
  loading: boolean;
  className?: string;
}) {
  if (loading) return <PrimarySkeleton tall />;
  return (
    <span className={className}>
      <CountUp end={value} duration={1} separator="," />
      {suffix}
    </span>
  );
}

function PrimarySkeleton({ tall }: { tall?: boolean }) {
  return (
    <span
      className={cn("crm-skeleton block", tall ? "h-12 w-36" : "h-9 w-16")}
      aria-hidden
    />
  );
}

function PipelineSkeleton() {
  return <span className="crm-skeleton mx-auto block h-7 w-10" aria-hidden />;
}

const MotionLink = motion(Link);

type PrimaryDef = {
  key: string;
  label: string;
  hint: string;
  href: string;
  accent: string;
  tier: 1 | 2;
  valueTone?: "up" | "risk" | "neutral";
  featured?: boolean;
  suffix: string;
  value: (v: DashboardKpiValues) => number;
};

const PRIMARY: PrimaryDef[] = [
  {
    key: "expected",
    label: "이번달 예상 총수익",
    hint: "수수료 + 대리점 수당 - 총 지원 비용",
    href: "/leads/contract-progress",
    accent: "bg-[#1a365d]",
    tier: 1,
    valueTone: "up",
    featured: true,
    suffix: "원",
    value: (v) => v.expectedCommissionWon,
  },
  {
    key: "confirmed",
    label: "이번달 확정 총수익",
    hint: "계약일 기준 확정 수익 합계",
    href: "/leads/delivery-complete",
    accent: "bg-indigo-700",
    tier: 1,
    valueTone: "up",
    featured: true,
    suffix: "원",
    value: (v) => v.confirmedCommissionThisMonthWon,
  },
  {
    key: "monthReg",
    label: "이번달 등록 고객 수",
    hint: "이번달 새로 등록된 고객",
    href: "/leads/new-db",
    accent: "bg-slate-500",
    tier: 2,
    valueTone: "up",
    suffix: "건",
    value: (v) => v.thisMonthRegisteredCount,
  },
  {
    key: "assigned",
    label: "현재 담당 고객 수",
    hint: "현재 내가 관리 중인 전체 고객",
    href: "/leads/new-db",
    accent: "bg-slate-400",
    tier: 2,
    valueTone: "neutral",
    suffix: "건",
    value: (v) => v.assignedCustomerCount,
  },
];

const PIPELINE: {
  key: string;
  label: string;
  hint: string;
  href: string;
  accent: string;
  valueKey: keyof PipelineStageCounts;
  valueTone?: "up" | "risk" | "neutral";
  compact?: boolean;
}[] = [
  { key: "new", label: "신규", hint: "새로 유입된 고객", href: "/leads/new-db", accent: "bg-slate-500", valueKey: "newDb", valueTone: "up" },
  {
    key: "counsel",
    label: "상담중",
    hint: "현재 상담 진행 중",
    href: "/leads/counseling-progress",
    accent: "bg-sky-600",
    valueKey: "counseling",
    valueTone: "neutral",
  },
  {
    key: "contract",
    label: "계약",
    hint: "계약 진행 또는 확정 고객",
    href: "/leads/contract-progress",
    accent: "bg-indigo-600",
    valueKey: "contract",
    valueTone: "up",
  },
  {
    key: "export",
    label: "출고",
    hint: "출고 일정 진행 고객",
    href: "/leads/contract-progress",
    accent: "bg-violet-600",
    valueKey: "exportProgress",
    valueTone: "neutral",
  },
  {
    key: "delivery",
    label: "인도완료",
    hint: "인도가 완료된 고객",
    href: "/leads/delivery-complete",
    accent: "bg-emerald-600",
    valueKey: "deliveryComplete",
    valueTone: "up",
  },
  { key: "hold", label: "보류", hint: "보류 상태 고객", href: "/leads/hold", accent: "bg-amber-500", valueKey: "hold", valueTone: "risk" },
  {
    key: "cancel",
    label: "취소",
    hint: "취소 처리 고객",
    href: "/leads/cancel",
    accent: "bg-rose-600/90",
    valueKey: "cancel",
    valueTone: "risk",
  },
  {
    key: "away",
    label: "부재",
    hint: "미응답 · 부재 상태",
    href: "/leads/unresponsive",
    accent: "bg-amber-600/80",
    valueKey: "unresponsive",
    valueTone: "risk",
    compact: true,
  },
];

const cardBase =
  "group crm-card crm-card-interactive flex h-full min-h-full flex-col overflow-hidden leading-[1.65]";

function valueToneClass(tone: "up" | "risk" | "neutral" | undefined) {
  if (tone === "up") return "text-[#16a34a] dark:text-emerald-300";
  if (tone === "risk") return "text-[#dc2626] dark:text-rose-300";
  return "text-[#111] dark:text-zinc-100";
}

export default function DashboardKpiCards({
  loading,
  values,
  pipeline,
}: {
  loading: boolean;
  values: DashboardKpiValues | null;
  pipeline: PipelineStageCounts | null;
}) {
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion === true;
  const kpiStagger = dashboardKpiStagger(reduce);
  const kpiItem = dashboardKpiItem(reduce);

  return (
    <div className="space-y-10">
      {/* 1단 — 핵심 돈·유입 */}
      <section aria-label="핵심 성과 지표">
        <div className="mb-4">
          <h2 className="text-[18px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">핵심 지표</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
            매출 · 유입 · 담당 규모를 먼저 확인합니다.
          </p>
        </div>
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch"
          variants={kpiStagger}
          initial="hidden"
          animate="show"
        >
          {PRIMARY.map((p) => (
            <MotionLink
              key={p.key}
              href={p.href}
              variants={kpiItem}
              whileHover={reduce ? undefined : { scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                cardBase,
                "min-h-[184px] cursor-pointer",
                p.featured && "border-[#dbe7fb] shadow-[0_14px_36px_rgba(37,99,235,0.16)]"
              )}
            >
              {p.featured ? (
                <div className="h-[3px] w-full shrink-0 bg-[linear-gradient(90deg,#2563eb,#60a5fa)]" aria-hidden />
              ) : (
                <div className={cn("h-[3px] w-full shrink-0", p.accent)} aria-hidden />
              )}
              <div className="flex flex-1 flex-col p-6 pt-5">
                <div className="text-[15px] font-semibold leading-[1.6] text-[#475569] dark:text-zinc-400">
                  {p.label}
                </div>
                <AnimatedNumber
                  value={values ? p.value(values) : 0}
                  suffix={p.suffix}
                  loading={loading || !values}
                  className={cn(
                    "mt-3 tabular-nums text-3xl font-extrabold leading-[1.45] tracking-tight sm:text-[38px]",
                    p.featured ? "text-[#0f172a] dark:text-zinc-100" : valueToneClass(p.valueTone)
                  )}
                />
                <p className="mt-auto pt-3 text-[12px] leading-[1.6] text-[#64748b] dark:text-zinc-500">{p.hint}</p>
              </div>
            </MotionLink>
          ))}
        </motion.div>
      </section>

      {/* 2단 — 파이프라인 */}
      <section aria-label="고객 진행 단계">
        <div className="mb-4">
          <h2 className="text-[18px] font-bold tracking-tight text-[var(--crm-accent)] dark:text-zinc-100">진행 현황</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
            단계별 병목을 왼쪽에서 오른쪽으로 빠르게 스캔합니다. 카드를 누르면 해당 목록으로 이동합니다.
          </p>
        </div>
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8"
          variants={kpiStagger}
          initial="hidden"
          animate="show"
        >
          {PIPELINE.map((s) => (
            <MotionLink
              key={s.key}
              href={s.href}
              variants={kpiItem}
              whileHover={reduce ? undefined : { scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                cardBase,
                "min-h-[126px] cursor-pointer",
                s.compact && "lg:col-span-1 xl:opacity-95"
              )}
            >
              <div className={cn("h-[3px] w-full shrink-0", s.accent)} aria-hidden />
              <div className="flex flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
                <div className="text-center text-[14px] font-semibold leading-[1.6] text-[#64748b] dark:text-zinc-400">
                  {s.label}
                </div>
                <div
                  className={cn(
                    "mt-2 text-center tabular-nums text-3xl font-extrabold leading-[1.5]",
                    valueToneClass(s.valueTone)
                  )}
                >
                  {loading || !pipeline ? <PipelineSkeleton /> : <CountUp end={pipeline[s.valueKey]} duration={1} />}
                </div>
                <p className="mt-2 text-center text-[12px] leading-[1.6] text-[#999] dark:text-zinc-500">
                  {s.hint}
                </p>
              </div>
            </MotionLink>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
