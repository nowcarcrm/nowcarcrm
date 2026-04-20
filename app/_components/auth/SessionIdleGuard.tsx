"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

const IDLE_MS = 30 * 60 * 1000;

/**
 * 30분 무활동 시 자동 로그아웃 (마우스·키보드·스크롤·터치를 활동으로 간주)
 */
export default function SessionIdleGuard({ onIdleLogout }: { onIdleLogout?: () => void }) {
  const last = useRef<number>(Date.now());
  const warned = useRef(false);

  useEffect(() => {
    if (!onIdleLogout) return;
    const bump = () => {
      last.current = Date.now();
      warned.current = false;
    };
    bump();
    const opts = { passive: true } as const;
    window.addEventListener("mousemove", bump, opts);
    window.addEventListener("mousedown", bump, opts);
    window.addEventListener("keydown", bump);
    window.addEventListener("scroll", bump, opts);
    window.addEventListener("touchstart", bump, opts);
    window.addEventListener("click", bump);

    const tick = window.setInterval(() => {
      if (Date.now() - last.current < IDLE_MS) return;
      if (warned.current) return;
      warned.current = true;
      toast.error("장시간 사용하지 않아 로그아웃 되었습니다.", { duration: 5000 });
      onIdleLogout();
    }, 60_000);

    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("mousedown", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("scroll", bump);
      window.removeEventListener("touchstart", bump);
      window.removeEventListener("click", bump);
      window.clearInterval(tick);
    };
  }, [onIdleLogout]);

  return null;
}
