"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * 로그인 좌측 패널 전용: GPU-friendly 모션 (transform / opacity만).
 * 모바일에서는 aside 자체가 숨겨져 이 컴포넌트가 마운트되지 않음.
 */
export function NowcarLoginBrandArt() {
  const reduce = useReducedMotion() === true;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* 은은한 글로우 2개 — 블러 원, 매우 낮은 불투명도 */}
      <motion.div
        className="absolute -left-[12%] top-[18%] h-[min(42vw,420px)] w-[min(42vw,420px)] rounded-full bg-white/[0.07] blur-[100px]"
        style={{ opacity: reduce ? 0.08 : undefined, willChange: reduce ? undefined : "transform" }}
        animate={
          reduce
            ? {}
            : {
                x: [0, 22, 0],
                y: [0, -14, 0],
              }
        }
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-[8%] bottom-[12%] h-[min(38vw,380px)] w-[min(38vw,380px)] rounded-full bg-slate-400/[0.08] blur-[90px]"
        style={{ opacity: reduce ? 0.07 : undefined, willChange: reduce ? undefined : "transform" }}
        animate={
          reduce
            ? {}
            : {
                x: [0, -18, 0],
                y: [0, 18, 0],
              }
        }
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
      />

      {/* 곡선 라인 — 좌→우 아주 느린 이동 */}
      <motion.div
        className="absolute inset-y-0 -left-[8%] w-[118%]"
        style={{ willChange: reduce ? undefined : "transform" }}
        animate={reduce ? {} : { x: ["-1.5%", "2.5%", "-1.5%"] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg
          className="h-full w-full text-white/90"
          viewBox="0 0 1200 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M-40 520 C 180 380, 320 620, 520 480 S 880 340, 1240 420"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
            className="opacity-[0.09]"
          />
          <path
            d="M-60 620 C 200 500, 400 720, 620 560 S 920 440, 1260 520"
            stroke="currentColor"
            strokeWidth="0.85"
            strokeLinecap="round"
            className="opacity-[0.065]"
          />
          <path
            d="M-20 380 C 220 260, 380 480, 580 360 S 860 240, 1220 300"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinecap="round"
            className="opacity-[0.05]"
          />
        </svg>
      </motion.div>
    </div>
  );
}
