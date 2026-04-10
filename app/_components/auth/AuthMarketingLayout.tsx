"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const cardMotion = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: "spring" as const, stiffness: 380, damping: 34 },
};

export function AuthMarketingBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-10 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[#eef1f7]" aria-hidden />
      <div
        className="pointer-events-none absolute -left-40 top-[-10%] h-[min(480px,50vh)] w-[min(480px,85vw)] rounded-full bg-[#5B5FFF]/14 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-[-5%] h-[min(420px,45vh)] w-[min(420px,80vw)] rounded-full bg-[#7C3AED]/12 blur-[90px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-200/35 via-transparent to-indigo-100/40"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-[460px] flex-col items-center justify-center sm:min-h-[calc(100dvh-7rem)]">
        {children}
      </div>
    </div>
  );
}

export function AuthMarketingCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="w-full rounded-[18px] border border-black/[0.06] bg-white/92 p-7 shadow-[0_24px_64px_-24px_rgba(15,23,42,0.22),0_0_0_1px_rgba(255,255,255,0.75)_inset] backdrop-blur-[3px] sm:p-8 dark:border-white/[0.08] dark:bg-zinc-900/88 dark:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.55)]"
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      {children}
    </motion.div>
  );
}

/** `public/images/nowcar-logo.png` 우선, 로드 실패 시 SVG 폴백 */
export function AuthBrandHeader() {
  return (
    <header className="mb-6 flex items-center gap-3.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/nowcar-logo.png"
        alt="나우카"
        width={160}
        height={40}
        className="h-8 w-auto max-h-[36px] shrink-0 object-contain object-left sm:h-[34px]"
        onError={(e) => {
          const el = e.currentTarget;
          if (!el.src.includes("nowcar-logo.svg")) el.src = "/images/nowcar-logo.svg";
        }}
      />
      <div className="min-w-0 flex-1 border-l border-zinc-200/90 pl-3.5 dark:border-zinc-700/80">
        <h1 className="text-lg font-bold leading-tight tracking-tight text-[#0f172a] sm:text-[1.15rem] dark:text-zinc-50">
          나우카 고객관리
        </h1>
        <p className="mt-0.5 text-[13px] font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#5B5FFF] to-[#7C3AED]">
          B2B CRM · 운영 콘솔
        </p>
      </div>
    </header>
  );
}

export const authFieldClass =
  "h-12 w-full rounded-[11px] border border-zinc-200/95 bg-white px-3.5 text-[15px] text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-200 placeholder:text-zinc-400 focus:border-[#6D63FF] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-indigo-400";

export const authLabelClass = "mb-2 block text-[13px] font-semibold text-zinc-600 dark:text-zinc-400";

export function AuthPrimaryButton({
  children,
  disabled,
  type = "submit",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { filter: "brightness(1.06)" }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      className="mt-6 flex h-[50px] w-full items-center justify-center rounded-[12px] bg-gradient-to-br from-[#5B5FFF] to-[#7C3AED] text-[15px] font-semibold text-white shadow-[0_8px_28px_-8px_rgba(91,95,255,0.55)] transition-shadow disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
    >
      {children}
    </motion.button>
  );
}

export function AuthFooterNote() {
  return (
    <p className="mt-6 text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-500">
      문제가 있을 경우 관리자에게 문의하세요.
    </p>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  if (!message.trim()) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-[12px] border border-rose-200/90 bg-rose-50/95 px-3.5 py-2.5 text-[13px] leading-snug text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100"
    >
      {message}
    </div>
  );
}
