export const SUPER_ADMIN_EMAIL = "jyy1964@naver.com";

export const USER_POSITIONS = [
  "주임",
  "대리",
  "과장",
  "차장",
  "팀장",
  "본부장",
  "대표",
] as const;

export type UserRole = "super_admin" | "admin" | "staff";
export type SelectableUserPosition = (typeof USER_POSITIONS)[number];
export type UserPosition = SelectableUserPosition | "총괄대표";
export type DisplayUserPosition = UserPosition;

type MaybeUserLike = {
  email?: string | null;
  role?: string | null;
  position?: string | null;
};

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (role === "super_admin" || role === "admin" || role === "staff") return role;
  // 레거시 manager는 staff로 흡수
  if (role === "manager") return "staff";
  return "staff";
}

export function normalizeUserPosition(position: string | null | undefined): UserPosition | null {
  if (position === "총괄대표") return "총괄대표";
  return USER_POSITIONS.includes(position as SelectableUserPosition)
    ? (position as SelectableUserPosition)
    : null;
}

export function effectiveRole(user: MaybeUserLike): UserRole {
  if (isSuperAdminEmail(user.email)) return "super_admin";
  return normalizeUserRole(user.role);
}

export function effectivePosition(user: MaybeUserLike): DisplayUserPosition | null {
  if (isSuperAdminEmail(user.email)) return "총괄대표";
  return normalizeUserPosition(user.position);
}

export function isSuperAdmin(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRole(user) === "super_admin";
}

export function isAdmin(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  const role = effectiveRole(user);
  return role === "super_admin" || role === "admin";
}

export function isStaff(user: MaybeUserLike | null | undefined): boolean {
  if (!user) return false;
  return effectiveRole(user) === "staff";
}

export function canEditPosition(user: MaybeUserLike | null | undefined): boolean {
  return isSuperAdmin(user);
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
