"use client";

import Image from "next/image";

export default function DashboardEntrance({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="dashboard-entrance-overlay" aria-hidden>
      <div className="dashboard-entrance-center">
        <Image
          src="/images/nowcar-ai-logo.png"
          alt="NOWCAR"
          width={180}
          height={60}
          className="dashboard-entrance-logo h-auto w-[180px] object-contain"
          priority
        />
        <p className="dashboard-entrance-loading mt-4 text-sm font-medium text-slate-600">로딩 중...</p>
      </div>
    </div>
  );
}
