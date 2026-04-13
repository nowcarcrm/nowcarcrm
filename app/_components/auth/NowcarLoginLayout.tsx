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
      staggerChildren: 0.08,
      delayChildren: 0.08,
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
    transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] as const },
  },
});

/** 데스크톱 좌측: 브랜드 쇼룸 톤 카피 + 진입 모션 */
function LeftBrandCopyDesktop() {
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion === true;

  return (
    <motion.div
      className="max-w-[520px] space-y-7 py-10"
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
        className="text-[36px] font-bold leading-[1.24] tracking-tight text-white/95"
        variants={textItem(reduce)}
      >
        지금 이 고객, 놓치고 계신 건 아닙니까?
      </motion.h2>
      <motion.p
        className="max-w-[420px] whitespace-pre-line text-[18px] font-normal leading-[1.55] text-white/92"
        variants={textItem(reduce)}
      >
        고객 흐름을 한눈에,
        계약 전환은 더 빠르게.
      </motion.p>
      <motion.p
        className="max-w-[460px] text-[16px] font-normal leading-relaxed text-white/86"
        variants={textItem(reduce)}
      >
        나우카 CRM으로 상담 → 계약 → 출고까지 한 번에 관리하세요.
      </motion.p>
    </motion.div>
  );
}

/** 모바일 상단: 정적 카피 (모션 최소화) */
function LeftBrandCopyMobile() {
  return (
    <div className="space-y-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/70">
        NOWCAR
      </p>
      <p className="text-[26px] font-bold leading-[1.25] tracking-tight text-white/95">
        지금 이 고객, 놓치고 계신 건 아닙니까?
      </p>
      <p className="whitespace-pre-line text-[14px] font-normal leading-relaxed text-white/90">
        고객 흐름을 한눈에,
        계약 전환은 더 빠르게.
      </p>
      <p className="text-[13px] font-normal leading-relaxed text-white/82">
        나우카 CRM으로 상담 → 계약 → 출고까지 한 번에 관리하세요.
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
        className="relative hidden min-h-dvh w-[52%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden lg:flex lg:px-14 lg:py-20 xl:px-16 xl:py-24"
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
