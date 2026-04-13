/**
 * CRM 공통 Framer Motion 프리셋 — 짧은 ease-out, 과한 스프링 지양.
 * `useReducedMotion()` 결과에 따라 initial/animate 단순화.
 */

export const CRM_EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const CRM_DURATION = {
  fast: 0.22,
  enter: 0.28,
  card: 0.38,
  loginCard: 0.52,
  modal: 0.26,
} as const;

/** 로그인 카드 전체 */
export function loginCardMotion(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.2, ease: "easeOut" as const },
    };
  }
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: CRM_DURATION.loginCard, ease: CRM_EASE_OUT },
  };
}

/** 로그인 카드 상단 타이틀 블록 */
export function loginTitleMotion(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.38, ease: CRM_EASE_OUT, delay: 0.04 },
  };
}

/** 로그인 폼 필드 stagger 컨테이너 */
export function loginFormStagger(reduce: boolean) {
  return {
    hidden: {},
    show: {
      transition: reduce
        ? { staggerChildren: 0, delayChildren: 0 }
        : { staggerChildren: 0.07, delayChildren: 0.12 },
    },
  };
}

export function loginFormItem(reduce: boolean) {
  return {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: CRM_EASE_OUT },
    },
  };
}

/** 라우트별 메인 콘텐츠 진입 */
export function pageContentMotion(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.18, ease: "easeOut" as const },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: CRM_DURATION.enter, ease: CRM_EASE_OUT },
  };
}

/** 대시보드 섹션 stagger */
export function dashboardPageStagger(reduce: boolean) {
  return {
    hidden: {},
    show: {
      transition: reduce
        ? { staggerChildren: 0, delayChildren: 0 }
        : { staggerChildren: 0.065, delayChildren: 0.06 },
    },
  };
}

export function dashboardSectionItem(reduce: boolean) {
  return {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.01 : 0.42, ease: CRM_EASE_OUT },
    },
  };
}

/** KPI 그리드 자식 (짧은 stagger) */
export function dashboardKpiStagger(reduce: boolean) {
  return {
    hidden: {},
    show: {
      transition: reduce
        ? { staggerChildren: 0, delayChildren: 0 }
        : { staggerChildren: 0.045, delayChildren: 0.04 },
    },
  };
}

export function dashboardKpiItem(reduce: boolean) {
  return {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.01 : 0.32, ease: CRM_EASE_OUT },
    },
  };
}

/** 모달 패널 (스프링 대신 tween) */
export function modalPanelMotion(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.2, ease: "easeOut" as const },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.99, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { duration: CRM_DURATION.modal, ease: CRM_EASE_OUT },
  };
}

export function modalBackdropMotion(reduce: boolean) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: reduce ? 0.12 : 0.2, ease: "easeOut" as const },
  };
}
