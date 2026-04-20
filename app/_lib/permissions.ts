import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { effectiveRole, isSuperAdmin, isSuperAdminEmail } from "@/app/(admin)/_lib/rolePermissions";

export type PermissionAction = "read" | "create" | "update" | "delete";

export type PermissionRoleSlug =
  | "super_admin"
  | "ceo"
  | "director"
  | "team_leader"
  | "manager"
  | "staff";

/** CRM 프로필 → permissions.role 슬러그 (DB 시드와 동일 키) */
export function resolvePermissionRoleSlug(input: {
  email?: string | null;
  role?: string | null;
  rank?: string | null;
}): PermissionRoleSlug {
  if (isSuperAdminEmail(input.email) || input.role === "super_admin") return "super_admin";
  const rank = (input.rank ?? "").trim();
  if (rank === "총괄대표") return "super_admin";
  if (rank === "대표") return "ceo";
  if (rank === "본부장") return "director";
  if (rank === "팀장") return "team_leader";
  if (rank === "과장" || rank === "차장") return "manager";
  const r = effectiveRole({ email: input.email, role: input.role ?? undefined });
  if (r === "admin") return "team_leader";
  return "staff";
}

/**
 * permissions 테이블 기준 권한 (다음 단계에서 API·화면에 점진 적용 예정)
 */
export async function checkPermission(
  userId: string,
  resource: string,
  action: PermissionAction
): Promise<boolean> {
  const { data: row, error } = await supabaseAdmin
    .from("users")
    .select("id, email, role, rank")
    .eq("id", userId)
    .maybeSingle();
  if (error || !row) return false;
  const u = row as { id: string; email: string | null; role: string | null; rank: string | null };
  if (isSuperAdmin({ email: u.email, role: u.role, rank: u.rank })) return true;
  const slug = resolvePermissionRoleSlug({ email: u.email, role: u.role, rank: u.rank });
  const col =
    action === "read"
      ? "can_read"
      : action === "create"
        ? "can_create"
        : action === "update"
          ? "can_update"
          : "can_delete";
  const { data: perm, error: pErr } = await supabaseAdmin
    .from("permissions")
    .select("id")
    .eq("role", slug)
    .eq("resource", resource)
    .eq(col, true)
    .maybeSingle();
  if (pErr) return false;
  return !!perm;
}
