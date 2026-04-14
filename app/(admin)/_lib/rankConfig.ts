import type { SelectableUserRank, UserRank } from "./rolePermissions";

export type RankTierLabel =
  | "브론즈"
  | "실버"
  | "골드"
  | "플래티넘"
  | "다이아"
  | "마스터"
  | "챌린저"
  | "신";

export type RankConfigItem = {
  rank: UserRank;
  tier: RankTierLabel;
  shortLabel: string;
  description: string;
  priority: number;
  badgeClass: string;
  cardAccentClass: string;
};

export const RANK_ORDER: UserRank[] = [
  "총괄대표",
  "대표",
  "본부장",
  "팀장",
  "차장",
  "과장",
  "대리",
  "주임",
];

export const RANK_CONFIG: Record<UserRank, RankConfigItem> = {
  주임: {
    rank: "주임",
    tier: "브론즈",
    shortLabel: "브론즈",
    description: "기본 운영 흐름을 안정적으로 관리합니다.",
    priority: 10,
    badgeClass:
      "border-[#b9825a] bg-[linear-gradient(135deg,#f5e1d2,#c48b62)] text-[#5a331d] dark:border-[#9a6a49] dark:bg-[linear-gradient(135deg,#7a5138,#a9704b)] dark:text-[#f5e3d6]",
    cardAccentClass: "from-[#f5e1d2] to-[#ffffff]",
  },
  대리: {
    rank: "대리",
    tier: "실버",
    shortLabel: "실버",
    description: "상담 품질과 리드 전환을 균형 있게 리드합니다.",
    priority: 20,
    badgeClass:
      "border-[#b8c1cf] bg-[linear-gradient(135deg,#f2f5f9,#cfd6e2)] text-[#344155] dark:border-[#7c879b] dark:bg-[linear-gradient(135deg,#4a566d,#7a879f)] dark:text-[#edf2fa]",
    cardAccentClass: "from-[#edf3f9] to-[#ffffff]",
  },
  과장: {
    rank: "과장",
    tier: "골드",
    shortLabel: "골드",
    description: "핵심 상담 흐름을 주도하고 전환을 가속합니다.",
    priority: 30,
    badgeClass:
      "border-[#d4b35e] bg-[linear-gradient(135deg,#fff2c9,#e1bd58)] text-[#5a430a] dark:border-[#b2913f] dark:bg-[linear-gradient(135deg,#7a6428,#a98a38)] dark:text-[#fff2c8]",
    cardAccentClass: "from-[#fff2c9] to-[#ffffff]",
  },
  차장: {
    rank: "차장",
    tier: "플래티넘",
    shortLabel: "플래티넘",
    description: "중요 고객군 운영을 안정적으로 조율합니다.",
    priority: 40,
    badgeClass:
      "border-[#b9d2df] bg-[linear-gradient(135deg,#eef8ff,#c3dbe8)] text-[#234154] dark:border-[#7ca0b4] dark:bg-[linear-gradient(135deg,#32586b,#5f8ca5)] dark:text-[#e9f8ff]",
    cardAccentClass: "from-[#e8f4ff] to-[#ffffff]",
  },
  팀장: {
    rank: "팀장",
    tier: "다이아",
    shortLabel: "다이아",
    description: "팀의 상담 우선순위와 실행 속도를 관리합니다.",
    priority: 50,
    badgeClass:
      "border-[#6fa7ff] bg-[linear-gradient(135deg,#dff1ff,#76a8ff)] text-[#0f3c80] dark:border-[#5f8fe0] dark:bg-[linear-gradient(135deg,#2d4f94,#4e78cb)] dark:text-[#e2efff]",
    cardAccentClass: "from-[#dff1ff] to-[#ffffff]",
  },
  본부장: {
    rank: "본부장",
    tier: "마스터",
    shortLabel: "마스터",
    description: "조직 단위 성과와 운영 품질을 총괄합니다.",
    priority: 60,
    badgeClass:
      "border-[#8e7fe6] bg-[linear-gradient(135deg,#ede7ff,#8c80de)] text-[#2f246d] dark:border-[#6f63b9] dark:bg-[linear-gradient(135deg,#3b2d79,#5f4fa8)] dark:text-[#efe9ff]",
    cardAccentClass: "from-[#ede7ff] to-[#ffffff]",
  },
  대표: {
    rank: "대표",
    tier: "챌린저",
    shortLabel: "챌린저",
    description: "고난도 파이프라인을 리드하는 상위 티어입니다.",
    priority: 70,
    badgeClass:
      "border-[#e26a7f] bg-[linear-gradient(135deg,#ffe1e8,#df5d78)] text-[#6f1628] dark:border-[#bf4a62] dark:bg-[linear-gradient(135deg,#7a2438,#aa3b53)] dark:text-[#ffe4eb]",
    cardAccentClass: "from-[#ffe6ec] to-[#ffffff]",
  },
  총괄대표: {
    rank: "총괄대표",
    tier: "신",
    shortLabel: "신",
    description: "NOWCAR CRM 최고 관리자 권한을 보유합니다.",
    priority: 80,
    badgeClass:
      "border-[#a188ff] bg-[linear-gradient(135deg,#f3eaff,#b393ff)] text-[#2e1d73] dark:border-[#7f66d8] dark:bg-[linear-gradient(135deg,#4a3298,#6e54c5)] dark:text-[#f1e9ff]",
    cardAccentClass: "from-[#f3eaff] to-[#ffffff]",
  },
};

export function normalizeRank(raw: string | null | undefined): UserRank | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t in RANK_CONFIG) return t as UserRank;
  return null;
}

export function rankPriority(rank: string | null | undefined): number {
  const normalized = normalizeRank(rank);
  return normalized ? RANK_CONFIG[normalized].priority : 0;
}

export function rankSelectOptions(isSuperAdmin: boolean): UserRank[] {
  const base: UserRank[] = ["주임", "대리", "과장", "차장", "팀장", "본부장", "대표"];
  if (isSuperAdmin) return [...base, "총괄대표"];
  return base;
}

export function getRankBadgeMeta(rank: string | null | undefined): RankConfigItem | null {
  const normalized = normalizeRank(rank);
  return normalized ? RANK_CONFIG[normalized] : null;
}
