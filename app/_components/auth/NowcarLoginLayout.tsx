"use client";

import type { ReactNode } from "react";

export function NowcarLoginShell({ children }: { children: ReactNode }) {
  const particles = Array.from({ length: 14 }, (_, idx) => ({
    id: idx,
    left: `${6 + (idx % 7) * 13}%`,
    top: `${14 + Math.floor(idx / 2) * 9}%`,
    size: `${2 + (idx % 4)}px`,
    duration: `${20 + (idx % 6) * 2}s`,
    delay: `${idx * 0.35}s`,
    opacity: `${0.12 + (idx % 4) * 0.05}`,
    color: idx % 2 === 0 ? "#60a5fa" : "#818cf8",
  }));

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#1e3a5f_100%)]">
      <div className="flex min-h-dvh">
        <section className="relative hidden min-h-dvh basis-3/5 overflow-hidden md:flex md:items-center md:justify-center">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a_0%,#1e3a5f_100%)] opacity-0 animate-[bgReveal_1.2s_ease-out_forwards]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)",
              backgroundSize: "20px 20px",
            }}
            aria-hidden
          />
          <span className="pointer-events-none absolute left-[-140px] top-1/2 h-px w-[220px] -translate-y-1/2 bg-[#3b82f6]/60 animate-[lineToCenterLeft_0.8s_ease-in_0.5s_forwards]" />
          <span className="pointer-events-none absolute right-[-140px] top-1/2 h-px w-[220px] -translate-y-1/2 bg-[#3b82f6]/60 animate-[lineToCenterRight_0.8s_ease-in_0.5s_forwards]" />
          <span className="pointer-events-none absolute left-1/2 top-[-160px] h-[240px] w-px -translate-x-1/2 bg-[#3b82f6]/60 animate-[lineToCenterTop_0.8s_ease-in_0.5s_forwards]" />
          <span className="pointer-events-none absolute bottom-[-160px] left-1/2 h-[240px] w-px -translate-x-1/2 bg-[#3b82f6]/60 animate-[lineToCenterBottom_0.8s_ease-in_0.5s_forwards]" />

          <div className="relative z-10 flex max-w-[640px] flex-col items-center px-8 text-center">
            <div className="relative mt-4">
              <div className="absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6]/25 opacity-0 blur-[80px] animate-[logoGlowReveal_0.65s_ease-out_1.2s_forwards,pulse_3s_ease-in-out_2.2s_infinite]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 opacity-0 animate-[orbitRingReveal_0.6s_ease-out_1.35s_forwards,orbitSpin_30s_linear_2s_infinite]" />
              <img
                src="/images/nowcar-ai-logo.png"
                alt="나우카"
                className="relative z-10 h-auto w-[280px] scale-[0.3] object-contain opacity-0 drop-shadow-[0_20px_46px_rgba(15,23,42,0.45)] animate-[logoPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_1.2s_forwards]"
              />
            </div>

            {particles.map((particle) => (
              <span
                key={particle.id}
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: particle.left,
                  top: particle.top,
                  width: particle.size,
                  height: particle.size,
                  opacity: Number(particle.opacity),
                  backgroundColor: particle.color,
                  animation: `float ${particle.duration} ease-in-out ${particle.delay} infinite`,
                }}
                aria-hidden
              />
            ))}

            <div className="pointer-events-none absolute bottom-12 left-0 right-0">
              <span className="absolute left-[36%] h-[220px] w-px bg-[#60a5fa]/20 animate-[riseLine_10s_linear_infinite]" />
              <span className="absolute left-1/2 h-[260px] w-px bg-[#60a5fa]/15 animate-[riseLine_12s_linear_infinite]" />
              <span className="absolute left-[62%] h-[200px] w-px bg-[#60a5fa]/20 animate-[riseLine_11s_linear_infinite]" />
            </div>

            <div className="mt-8">
              <h1 className="translate-y-5 text-[36px] font-bold tracking-[0.18em] text-white opacity-0 animate-[textReveal_0.5s_ease-out_1.8s_forwards]">
                NOWCAR
              </h1>
              <p className="mt-3 translate-y-5 text-base text-[#94a3b8] opacity-0 animate-[textReveal_0.5s_ease-out_2.1s_forwards]">
                AI 기반 리스·렌트 통합 영업 시스템
              </p>
            </div>

            <div className="mt-10 space-y-3 text-left text-sm text-[#cbd5e1]">
              <p className="translate-x-[-30px] opacity-0 animate-[slideInLeft_0.4s_ease-out_2.5s_forwards]">🚀 중간 수수료 없는 다이렉트</p>
              <p className="translate-x-[-30px] opacity-0 animate-[slideInLeft_0.4s_ease-out_2.8s_forwards]">🤖 AI 영업 비서가 함께합니다</p>
              <p className="translate-x-[-30px] opacity-0 animate-[slideInLeft_0.4s_ease-out_3.1s_forwards]">📊 실시간 고객 분석</p>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-dvh w-full flex-1 items-center justify-center px-4 py-8 md:basis-2/5 md:bg-white md:px-8">
          <div className="absolute inset-0 md:hidden" aria-hidden />
          <div className="w-full max-w-[440px] animate-[formSlideIn_0.7s_ease-out_1.5s_both]">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
