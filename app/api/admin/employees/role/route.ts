import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import {
  USER_POSITIONS,
  canManageTarget,
  effectiveRole,
  isProtectedSuperAdmin,
  isSuperAdmin,
  type SelectableUserPosition,
} from "@/app/(admin)/_lib/rolePermissions";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function effectiveApproval(
  status: string | null | undefined
): "pending" | "approved" | "rejected" {
  if (status === "pending" || status === "rejected" || status === "approved") return status;
  return "pending";
}

async function requireApprovedAdmin(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, email, role, approval_status, position")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { admin: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, email, role, approval_status, position")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (e2) return { admin: null as null, error: e2.message };
    row = legacy;
  }

  if (!row) return { admin: null as null, error: "직원 계정을 찾을 수 없습니다." };
  if (effectiveApproval(row.approval_status) !== "approved") {
    return { admin: null as null, error: "승인된 관리자만 이 작업을 할 수 있습니다." };
  }
  const requesterRole = effectiveRole({ role: row.role, email: row.email });
  if (requesterRole !== "super_admin" && requesterRole !== "admin") {
    return { admin: null as null, error: "관리자만 직원 권한을 변경할 수 있습니다." };
  }
  return { admin: { ...row, role: requesterRole }, error: null as null };
}

/**
 * PATCH: 직원 role 변경 (admin 전용)
 * body: { userId: string, role?: "super_admin" | "admin" | "staff", position?: SelectableUserPosition }
 */
export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const { admin, error } = await requireApprovedAdmin(authData.user.id);
    if (!admin) {
      return NextResponse.json({ error: error ?? "권한이 없습니다." }, { status: 403 });
    }

    const body = (await req.json()) as { userId?: unknown; role?: unknown; position?: unknown };
    const userId =
      body.userId == null || body.userId === ""
        ? ""
        : typeof body.userId === "string"
          ? body.userId
          : String(body.userId);
    const nextRole =
      body.role === "super_admin" || body.role === "admin" || body.role === "staff" ? body.role : null;
    const nextPosition = USER_POSITIONS.includes(body.position as SelectableUserPosition)
      ? (body.position as SelectableUserPosition)
      : null;

    if (!userId || (!nextRole && !nextPosition)) {
      return NextResponse.json(
        { error: "userId와 role(super_admin|admin|staff) 또는 position이 필요합니다." },
        { status: 400 }
      );
    }

    const { data: targetRow, error: tErr } = await supabaseAdmin
      .from("users")
      .select("id, email, role, approval_status, position")
      .eq("id", userId)
      .maybeSingle();

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }
    if (!targetRow) {
      return NextResponse.json({ error: "대상 직원을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetRole = effectiveRole({ role: targetRow.role, email: targetRow.email });
    const requester = admin;

    if (!canManageTarget(requester, targetRow)) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    if (!isSuperAdmin(requester)) {
      return NextResponse.json({ error: "권한 변경은 최고 관리자만 가능합니다." }, { status: 403 });
    }

    if (nextRole === "admin" && effectiveApproval(targetRow.approval_status) !== "approved") {
      return NextResponse.json(
        { error: "승인 완료된 직원만 관리자로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (nextRole && userId === admin.id && nextRole === "staff") {
      return NextResponse.json(
        { error: "본인 계정은 일반 직원으로 변경할 수 없습니다." },
        { status: 400 }
      );
    }

    if (
      targetRole === "admin" &&
      nextRole === "staff" &&
      effectiveApproval(targetRow.approval_status) === "approved"
    ) {
      const { data: admins, error: aErr } = await supabaseAdmin
        .from("users")
        .select("id, email, role, approval_status")
        .eq("role", "admin");
      if (aErr) {
        return NextResponse.json({ error: aErr.message }, { status: 400 });
      }
      const otherApprovedAdmin = (admins ?? []).some(
        (u) => u.id !== userId && effectiveApproval(u.approval_status) === "approved"
      );
      if (!otherApprovedAdmin) {
        return NextResponse.json(
          { error: "마지막 승인된 관리자 계정은 일반 직원으로 변경할 수 없습니다." },
          { status: 400 }
        );
      }
    }

    if (nextRole === "super_admin" && !isSuperAdmin(requester)) {
      return NextResponse.json({ error: "최고 관리자 승급은 최고 관리자만 가능합니다." }, { status: 403 });
    }
    if (isProtectedSuperAdmin(targetRow) && !isSuperAdmin(requester)) {
      return NextResponse.json({ error: "총괄대표 계정은 수정할 수 없습니다." }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (nextRole) patch.role = nextRole;
    if (nextPosition) patch.position = nextPosition;

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select("id, email, name, role, position, approval_status")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }
    if (!updated) {
      return NextResponse.json({ error: "권한을 갱신하지 못했습니다." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
