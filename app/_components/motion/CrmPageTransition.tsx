"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { pageContentMotion } from "@/app/_lib/crmMotion";

/**
 * (admin) 라우트 전환 시 메인 콘텐츠만 짧게 fade(+미세 y).
 * 레이아웃·헤더·사이드바는 고정.
 */
export default function CrmPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const m = pageContentMotion(!!reduce);

  return (
    <motion.div
      key={pathname}
      initial={m.initial}
      animate={m.animate}
      transition={m.transition}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}
