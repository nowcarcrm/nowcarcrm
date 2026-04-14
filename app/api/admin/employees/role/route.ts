import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import {
  USER_RANKS,
  USER_TEAMS,
  canEditTeamSetting,
  canManageTarget,
  effectiveRank,
  effectiveRole,
  normalizeUserRank,
  isProtectedSuperAdmin,
  isSuperAdmin,
  type SelectableUserRank,
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

async function requireApprovedUser(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, email, role, rank, team_name, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { admin: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, email, role, rank, team_name, approval_status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (e2) return { admin: null as null, error: e2.message };
    row = legacy;
  }

  if (!row) return { admin: null as null, error: "직원 계정을 찾을 수 없습니다." };
  if (effectiveApproval(row.approval_status) !== "approved") {
    return { user: null as null, error: "승인된 직원만 이 작업을 할 수 있습니다." };
  }
  const requesterRole = effectiveRole({ role: row.role, email: row.email });
  return {
    user: {
      ...row,
      role: requesterRole,
      rank: effectiveRank({ rank: row.rank, email: row.email, role: row.role }),
    },
    error: null as null,
  };
}

/**
 * PATCH: 직원 role 변경 (admin 전용)
 * body: { userId: string, role?: "super_admin" | "admin" | "staff", rank?: SelectableUserRank | "총괄대표" | null, team_name?: "1팀" | "2팀" | null }
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

    const { user: requester, error } = await requireApprovedUser(authData.user.id);
    if (!requester) {
      return NextResponse.json({ error: error ?? "권한이 없습니다." }, { status: 403 });
    }

    const body = (await req.json()) as { userId?: unknown; role?: unknown; rank?: unknown; team_name?: unknown };
    const userId =
      body.userId == null || body.userId === ""
        ? ""
        : typeof body.userId === "string"
          ? body.userId
          : String(body.userId);
    const nextRole =
      body.role === "super_admin" || body.role === "admin" || body.role === "staff" ? body.role : null;
    const requestedRank =
      body.rank == null
        ? null
        : body.rank === "총괄대표"
          ? "총괄대표"
          : USER_RANKS.includes(body.rank as SelectableUserRank)
            ? (body.rank as SelectableUserRank)
            : null;
    const nextTeam =
      body.team_name == null
        ? null
        : USER_TEAMS.includes(body.team_name as (typeof USER_TEAMS)[number])
          ? (body.team_name as (typeof USER_TEAMS)[number])
          : "";
    if (!userId || (!nextRole && requestedRank === null && nextTeam === null)) {
      return NextResponse.json(
        { error: "userId와 role/rank/team_name 중 하나가 필요합니다." },
        { status: 400 }
      );
    }

    const { data: targetRow, error: tErr } = await supabaseAdmin
      .from("users")
      .select("id, email, role, rank, approval_status")
      .eq("id", userId)
      .maybeSingle();

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }
    if (!targetRow) {
      return NextResponse.json({ error: "대상 직원을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetRole = effectiveRole({ role: targetRow.role, email: targetRow.email });
    const isTeamOnlyPatch = nextTeam !== null && !nextRole && requestedRank === null;
    if (!isTeamOnlyPatch && !canManageTarget(requester, targetRow)) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    if (!isSuperAdmin(requester) && nextRole) {
      return NextResponse.json({ error: "권한 변경은 최고 관리자만 가능합니다." }, { status: 403 });
    }

    if (nextRole === "admin" && effectiveApproval(targetRow.approval_status) !== "approved") {
      return NextResponse.json(
        { error: "승인 완료된 직원만 관리자로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (nextRole && userId === requester.id && nextRole === "staff") {
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

    if (requestedRank !== null) {
      if (!isSuperAdmin(requester)) {
        return NextResponse.json({ error: "직급 변경은 최고 관리자만 가능합니다." }, { status: 403 });
      }
      if (requestedRank === "총괄대표" && nextRole !== "super_admin" && targetRole !== "super_admin") {
        return NextResponse.json({ error: "총괄대표는 super_admin만 설정할 수 있습니다." }, { status: 400 });
      }
      const normalized = normalizeUserRank(requestedRank);
      patch.rank = normalized;
    }

    if (nextTeam !== null) {
      if (!canEditTeamSetting(requester)) {
        return NextResponse.json({ error: "팀 설정 변경은 대표급 이상만 가능합니다." }, { status: 403 });
      }
      if (nextTeam === "") {
        return NextResponse.json({ error: "팀 설정은 1팀 또는 2팀만 가능합니다." }, { status: 400 });
      }
      patch.team_name = nextTeam;
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select("id, email, name, role, rank, team_name, approval_status")
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
