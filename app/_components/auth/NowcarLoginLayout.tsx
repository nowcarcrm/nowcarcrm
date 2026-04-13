"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NowcarLoginBrandArt } from "./NowcarLoginBrandArt";

const asideBgStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #0f172a 0%, #152238 48%, #1e293b 100%)",
};

const textContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.12,
    },
  },
};

const textItem = (reduce: boolean) => ({
  hidden: reduce
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] as const },
  },
});

/** 데스크톱 좌측: 브랜드 쇼룸 톤 카피 + 진입 모션 */
function LeftBrandCopyDesktop() {
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion === true;

  return (
    <motion.div
      className="max-w-md space-y-6"
      variants={textContainer}
      initial="hidden"
      animate="show"
    >
      <motion.p
        className="text-[13px] font-semibold uppercase tracking-[0.28em] text-white/90"
        variants={textItem(reduce)}
      >
        NOWCAR
      </motion.p>
      <motion.h2
        className="text-[1.75rem] font-semibold leading-[1.2] tracking-tight text-white sm:text-3xl"
        variants={textItem(reduce)}
      >
        Drive Your Business
      </motion.h2>
      <motion.p
        className="max-w-sm text-[15px] font-medium leading-relaxed text-white/55"
        variants={textItem(reduce)}
      >
        Premium Auto CRM Solution
      </motion.p>
    </motion.div>
  );
}

/** 모바일 상단: 정적 카피 (모션 최소화) */
function LeftBrandCopyMobile() {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/70">
        NOWCAR
      </p>
      <p className="text-[16px] font-semibold tracking-tight text-white/95">
        Drive Your Business
      </p>
      <p className="text-[12px] font-medium text-white/50">
        Premium Auto CRM Solution
      </p>
    </div>
  );
}

/**
 * 로그인 전용 좌·우 분할 셸. 우측에 폼 카드(children) 배치.
 * 좌측(lg+): 딥 네이비 그라데이션 + 은은한 모션 그래픽 + 브랜드 텍스트.
 */
export function NowcarLoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--nowcar-auth-surface)] lg:flex-row">
      {/* 모바일 상단 — 정적 배경만 */}
      <header
        className="px-6 py-8 lg:hidden"
        style={asideBgStyle}
      >
        <LeftBrandCopyMobile />
      </header>

      {/* 데스크톱 좌측 */}
      <aside
        className="relative hidden min-h-dvh w-[52%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden lg:flex lg:px-12 lg:py-16 xl:px-14 xl:py-20"
        style={asideBgStyle}
        aria-label="NOWCAR"
      >
        {/* 레이어 1: 베이스는 aside background */}
        {/* 레이어 2: 모션 그래픽 */}
        <NowcarLoginBrandArt />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(30,58,95,0.12)_0%,transparent_55%)]" aria-hidden />

        {/* 레이어 3: 텍스트 최상단 */}
        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <LeftBrandCopyDesktop />
        </div>
        <p className="relative z-10 text-[11px] font-medium tracking-wide text-white/35">
          © NOWCAR · Internal CRM
        </p>
      </aside>

      {/* 폼 영역 */}
      <main className="flex flex-1 flex-col justify-center px-5 py-12 sm:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center">{children}</div>
      </main>
    </div>
  );
}
