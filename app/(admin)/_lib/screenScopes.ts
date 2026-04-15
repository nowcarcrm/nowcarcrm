import { canAccessAdminPage, effectiveRank, normalizeUserTeam } from "./rolePermissions";

type Viewer = {
  id?: string | null;
  role?: string | null;
  rank?: string | null;
  team_name?: string | null;
  name?: string | null;
};

type UserLike = {
  id: string;
  role?: string | null;
  rank?: string | null;
  team_name?: string | null;
  name?: string | null;
};

export type ScreenScope = "all" | "all_except_executive" | "team" | "self" | "none";

const PROTECTED_NAMES = new Set(["정서호", "이준영"]);

export function isProtectedExecutiveUser(user: Pick<UserLike, "rank" | "name">): boolean {
  const rank = (user.rank ?? "").trim();
  const name = (user.name ?? "").trim();
  if (rank === "대표" || rank === "총괄대표") return true;
  return PROTECTED_NAMES.has(name);
}

export function getEmployeeManagementScope(viewer: Viewer): ScreenScope {
  if (isTeamLeader(viewer)) return "team";
  const rank = effectiveRank(viewer);
  if (rank === "총괄대표" || rank === "대표") return "all";
  if (rank === "본부장") return "all_except_executive";
  return "none";
}

export function getAttendanceScope(viewer: Viewer): ScreenScope {
  const rank = effectiveRank(viewer);
  if (rank === "총괄대표" || rank === "대표") return "all";
  if (rank === "본부장") return "all_except_executive";
  if (rank === "팀장" && normalizeUserTeam(viewer.team_name)) return "team";
  return "self";
}

export function getAdminOverviewScope(viewer: Viewer): ScreenScope {
  if (isTeamLeader(viewer)) return "team";
  const rank = effectiveRank(viewer);
  if (rank === "총괄대표" || rank === "대표") return "all";
  if (rank === "본부장") return "all_except_executive";
  return "self";
}

export function canAccessAdminOverview(viewer: Viewer): boolean {
  return canAccessAdminPage(viewer);
}

export function getPersonalPipelineScope(_viewer: Viewer): "self" {
  return "self";
}

export function isTeamLeader(viewer: Viewer): boolean {
  const role = (viewer.role ?? "").trim();
  const rank = effectiveRank(viewer);
  const team = normalizeUserTeam(viewer.team_name);
  return role === "admin" && rank === "팀장" && !!team;
}

export function getProtectedExecutiveIds<T extends UserLike>(users: T[]): string[] {
  return users
    .filter((u) => isProtectedExecutiveUser({ rank: u.rank ?? null, name: u.name ?? null }))
    .map((u) => u.id)
    .filter(Boolean);
}

export function getTeamVisibleUserIds<T extends UserLike>(viewer: Viewer, users: T[]): string[] {
  const viewerTeam = normalizeUserTeam(viewer.team_name);
  if (!isTeamLeader(viewer) || !viewerTeam) return [];
  const protectedIds = new Set(getProtectedExecutiveIds(users));
  return users
    .filter((u) => normalizeUserTeam(u.team_name) === viewerTeam)
    .filter((u) => !protectedIds.has(u.id))
    .map((u) => u.id)
    .filter(Boolean);
}

export function getTeamLeaderOverviewScope<T extends UserLike>(viewer: Viewer, users: T[]): string[] {
  return getTeamVisibleUserIds(viewer, users);
}

export function getTeamLeaderPersonalPipelineScope(viewer: Viewer): string[] {
  const viewerId = (viewer.id ?? "").trim();
  return viewerId ? [viewerId] : [];
}

export function filterUsersByScreenScope<T extends UserLike>(users: T[], viewer: Viewer, scope: ScreenScope): T[] {
  const viewerId = (viewer.id ?? "").trim();
  const viewerTeam = normalizeUserTeam(viewer.team_name);
  const excludeProtected = scope === "all_except_executive" || scope === "team" || scope === "self";

  const maybeNoProtected = excludeProtected
    ? users.filter((u) => !isProtectedExecutiveUser({ rank: u.rank ?? null, name: u.name ?? null }))
    : users;

  if (scope === "all") return maybeNoProtected;
  if (scope === "all_except_executive") return maybeNoProtected;
  if (scope === "team") {
    if (!viewerTeam) return maybeNoProtected.filter((u) => u.id === viewerId);
    return maybeNoProtected.filter((u) => normalizeUserTeam(u.team_name) === viewerTeam);
  }
  if (scope === "self") return maybeNoProtected.filter((u) => u.id === viewerId);
  return [];
}

export function extractVisibleUserIds<T extends UserLike>(users: T[]): string[] {
  return users.map((u) => u.id).filter(Boolean);
}
