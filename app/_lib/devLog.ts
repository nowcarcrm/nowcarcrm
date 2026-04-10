/** 개발 환경에서만 콘솔 출력 (운영 빌드 노이즈 방지) */
export function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.warn(...args);
  }
}
