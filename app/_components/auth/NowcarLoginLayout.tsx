"use client";

import type { ReactNode } from "react";

/** 좌측 패널: 짧은 카피만 (로고는 로그인 카드에서 노출) */
function LeftBrandCopy({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
          Premium Auto CRM
        </p>
        <p className="text-[15px] font-semibold tracking-tight text-white/95">
          Drive Your Business
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-md space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
        Premium Auto CRM
      </p>
      <h2 className="text-[1.65rem] font-semibold leading-[1.25] tracking-tight text-white sm:text-3xl">
        Drive Your Business
        <span className="mt-1 block text-[0.92em] font-medium text-white/88">with NOWCAR</span>
      </h2>
      <p className="max-w-sm text-[14px] leading-relaxed text-white/55">
        렌트·금융 운영을 하나의 콘솔에서.
      </p>
    </div>
  );
}

/**
 * 로그인 전용 좌·우 분할 셸. 우측에 폼 카드(children) 배치.
 * 좌측은 딥 네이비 + 최소 장식.
 */
export function NowcarLoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--nowcar-auth-surface)] lg:flex-row">
      {/* 모바일 상단 */}
      <header className="bg-gradient-to-br from-[var(--nowcar-auth-navy-deep)] via-[var(--nowcar-auth-navy-mid)] to-[var(--nowcar-auth-navy-soft)] px-6 py-8 lg:hidden">
        <LeftBrandCopy compact />
      </header>

      {/* 데스크톱 좌측 */}
      <aside
        className="relative hidden min-h-dvh w-[52%] max-w-[640px] shrink-0 flex-col justify-between bg-gradient-to-br from-[var(--nowcar-auth-navy-deep)] via-[var(--nowcar-auth-navy-mid)] to-[var(--nowcar-auth-navy-soft)] lg:flex lg:px-12 lg:py-16 xl:px-14 xl:py-20"
        aria-label="NOWCAR"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,51,141,0.07)_0%,transparent_45%)]" />
        <div className="relative z-[1] flex flex-1 flex-col justify-center">
          <LeftBrandCopy />
        </div>
        <p className="relative z-[1] text-[11px] font-medium tracking-wide text-white/35">
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
