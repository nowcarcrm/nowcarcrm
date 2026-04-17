export const SUPER_ADMIN_EMAIL = "jyy1964@naver.com";

export const USER_RANKS = [
  "주임",
  "대리",
  "과장",
  "차장",
  "팀장",
  "본부장",
  "대표",
] as const;
export const USER_TEAMS = ["1팀", "2팀"] as const;
export const USER_DIVISIONS = ["1본부"] as const;

export type UserRole = "super_admin" | "admin" | "staff";
export type SelectableUserRank = (typeof USER_RANKS)[number];
export type UserRank = SelectableUserRank | "총괄대표";
export type DisplayUserRank = UserRank;
export type UserTeam = (typeof USER_TEAMS)[number];
export type UserDivision = (typeof USER_DIVISIONS)[number];
export const ADMIN_RANKS = ["총괄대표", "대표", "본부장", "팀장"] as const;
export type AdminRank = (typeof ADMIN_RANKS)[number];
export const USER_RANK_CHIEF_EXECUTIVE = ADMIN_RANKS[0];

type MaybeUserLike = {
  email?: string | null;
  role?: string | null;
  rank?: string | null;
  team_name?: string | null;
  division_name?: string | null;
  id?: string | null;
};

export type DataAccessScope = "all" | "all_except_executive" | "team" | "self";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (role === "super_admin" || role === "admin" || role === "staff") return role;
  // 레거시 manager는 staff로 흡수
  if (role === "manager") return "staff";
  return "staff";
}

export function normalizeUserRank(rank: string | null | undefined): UserRank | null {
  const normalized = (rank ?? "").trim();
  if (normalized === "총괄대표") return "총괄대표";
  return USER_RANKS.includes(normalized as SelectableUserRank)
    ? (normalized as SelectableUserRank)
    : null;
}

export function normalizeUserTeam(teamName: string | null | undefined): UserTeam | null {
  const normalized = (teamName ?? "").trim();
  return USER_TEAMS.includes(normalized as UserTeam) ? (normalized as UserTeam) : null;
}

export function effectiveRole(user: MaybeUserLike): UserRole {
  if (isSuperAdminEmail(user.email)) return "super_admin";
  return normalizeUserRole(user.role);
}

export function effectiveRank(user: MaybeUserLike): DisplayUserRank | null {
  if (isSuperAdminEmail(user.email)) return "총괄대표";
  return normalizeUserRank(user.rank);
}

export function isSuperAdmin(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRole(user) === "super_admin";
}

export function isAdmin(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return isAdminRank(effectiveRank(user));
}

export function isStaff(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRole(user) === "staff";
}

export function canEditRank(user: MaybeUserLike | null | undefined): boolean {
  return isSuperAdmin(user);
}

export function isExecutiveRank(rank: string | null | undefined): boolean {
  return rank === "대표" || rank === "총괄대표";
}

export function isAdminRank(rank: string | null | undefined): rank is AdminRank {
  const normalized = (rank ?? "").trim();
  return (ADMIN_RANKS as readonly string[]).includes(normalized);
}

export function isExecutive(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  const rank = effectiveRank(user);
  return rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

export function canPatchAttendanceStatusByRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim();
  return r === "본부장" || r === "대표" || r === "총괄대표";
}

export function canProxyLeaveRequestByRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim();
  return r === "팀장" || r === "본부장" || r === "대표" || r === "총괄대표";
}

export function isTeamLeader(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRole(user) === "admin" && effectiveRank(user) === "팀장" && !!normalizeUserTeam(user.team_name);
}

export function isDivisionHead(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRank(user) === "본부장";
}

export function canViewDivisionWide(user: MaybeUserLike | null | undefined): boolean {
  return isDivisionHead(user);
}

export function canViewAll(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const rank = effectiveRank(user);
  return rank === "대표" || rank === "총괄대표";
}

export function canAccessAdminPage(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return isAdminRank(effectiveRank(user));
}

export function canAccessAdminDetail(user: MaybeUserLike | null | undefined): boolean {
  return canAccessAdminPage(user);
}

export function canViewAllConsultations(user: MaybeUserLike | null | undefined): boolean {
  return canAccessAdminPage(user);
}

export function canViewStaffDetail(user: MaybeUserLike | null | undefined): boolean {
  return canAccessAdminDetail(user);
}

export function canViewTeam(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return isTeamLeader(user);
}

export function getDataAccessScopeByRank(user: MaybeUserLike | null | undefined): DataAccessScope {
  if (!user) return "self";
  const rank = effectiveRank(user);
  if (rank === "총괄대표" || rank === "대표") return "all";
  if (rank === "본부장") return "all_except_executive";
  if (rank === "팀장" && normalizeUserTeam(user.team_name)) return "team";
  return "self";
}

export function canManageTeam(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const rank = effectiveRank(user);
  return rank === "대표" || rank === "총괄대표";
}

export function canEditTeamSetting(user: MaybeUserLike | null | undefined): boolean {
  return canManageTeam(user);
}

export function isProtectedExecutiveTarget(target: MaybeUserLike | null | undefined): boolean {
  if (!target) return false;
  return isExecutive(target);
}

export function getVisibleTeamScope(
  user: MaybeUserLike | null | undefined
): "all" | "division" | "team" | "self" {
  if (!user) return "self";
  if (canViewAll(user)) return "all";
  if (canViewDivisionWide(user)) return "division";
  if (canViewTeam(user)) return "team";
  return "self";
}

export function canViewLead(
  viewer: MaybeUserLike | null | undefined,
  owner: MaybeUserLike | null | undefined
): boolean {
  if (!viewer || !owner) return false;
  if (viewer.id && owner.id && viewer.id === owner.id) return true;
  if (isProtectedExecutiveTarget(owner) && !canViewAll(viewer) && !isSuperAdmin(viewer)) {
    return false;
  }
  const scope = getVisibleTeamScope(viewer);
  if (scope === "all") return true;
  if (scope === "division") return true;
  if (scope === "self") {
    return !!viewer.id && !!owner.id && viewer.id === owner.id;
  }
  const viewerTeam = normalizeUserTeam(viewer.team_name);
  const ownerTeam = normalizeUserTeam(owner.team_name);
  if (!viewerTeam || !ownerTeam) {
    return !!viewer.id && !!owner.id && viewer.id === owner.id;
  }
  return viewerTeam === ownerTeam;
}

export function canViewAllLeads(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const rank = effectiveRank(user);
  return rank === "총괄대표" || rank === "대표" || rank === "본부장";
}

export function canAccessLeadDetail(
  user: MaybeUserLike | null | undefined,
  currentUserId: string | null | undefined,
  leadManagerUserId: string | null | undefined
): boolean {
  if (!user) return false;
  if (canViewAllLeads(user)) return true;
  const viewerId = (currentUserId ?? "").trim();
  const managerId = (leadManagerUserId ?? "").trim();
  if (!viewerId || !managerId) return false;
  return viewerId === managerId;
}

export function canViewAttendance(
  viewer: MaybeUserLike | null | undefined,
  target: MaybeUserLike | null | undefined
): boolean {
  return canViewLead(viewer, target);
}

export function canViewUser(
  viewer: MaybeUserLike | null | undefined,
  target: MaybeUserLike | null | undefined
): boolean {
  return canViewLead(viewer, target);
}

export function isProtectedSuperAdmin(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return isSuperAdminEmail(user.email) || effectiveRole(user) === "super_admin";
}

export function canManageTarget(
  current: MaybeUserLike | null | undefined,
  target: MaybeUserLike | null | undefined
): boolean {
  if (!current || !target) return false;
  if (isSuperAdmin(current)) return true;
  if (!isAdmin(current)) return false;
  return effectiveRole(target) === "staff";
}
