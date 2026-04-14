import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import {
  effectiveRole,
  normalizeUserTeam,
} from "@/app/(admin)/_lib/rolePermissions";
import {
  filterUsersByScreenScope,
  getEmployeeManagementScope,
  getTeamVisibleUserIds,
  isTeamLeader,
} from "@/app/(admin)/_lib/screenScopes";

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
    .select("id, email, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { admin: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, email, role, approval_status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (e2) return { admin: null as null, error: e2.message };
    row = legacy;
  }

  if (!row) return { admin: null as null, error: "직원 계정을 찾을 수 없습니다." };
  if (effectiveApproval(row.approval_status) !== "approved") {
    return { admin: null as null, error: "승인된 관리자만 이 작업을 할 수 있습니다." };
  }
  const role = effectiveRole({ role: row.role, email: row.email });
  if (role !== "super_admin" && role !== "admin") {
    return { admin: null as null, error: "관리자만 직원 승인을 처리할 수 있습니다." };
  }
  return { admin: { ...row, role }, error: null as null };
}

async function requireApprovedViewer(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, email, role, rank, team_name, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { user: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, email, role, rank, team_name, approval_status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (e2) return { user: null as null, error: e2.message };
    row = legacy;
  }
  if (!row) return { user: null as null, error: "직원 계정을 찾을 수 없습니다." };
  if (effectiveApproval(row.approval_status) !== "approved") {
    return { user: null as null, error: "승인된 직원만 이 작업을 할 수 있습니다." };
  }
  return { user: row, error: null as null };
}

async function getVisibleUserIdsForViewer(viewer: {
  id: string;
  email: string | null;
  role: string | null;
  rank: string | null;
  team_name: string | null;
}) {
  const scope = getEmployeeManagementScope(viewer);
  if (scope === "none") return [];
  if (scope === "all") return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,role,rank,team_name,name");
  if (error) throw new Error(error.message);
  const allRows = (data ?? []) as Array<{
    id: string;
    email: string | null;
    role: string | null;
    rank: string | null;
    team_name: string | null;
    name?: string | null;
  }>;
  const viewerTeam = normalizeUserTeam(viewer.team_name);
  const teamVisibleUserIds = getTeamVisibleUserIds(viewer, allRows);
  const scopedRows =
    scope === "team"
      ? allRows.filter((row) => teamVisibleUserIds.includes(row.id))
      : filterUsersByScreenScope(allRows, viewer, scope);
  const out = scopedRows.map((r) => r.id);
  if (!out.includes(viewer.id)) out.push(viewer.id);
  console.log("[user-approval] visible ids", {
    currentUserRole: viewer.role,
    currentUserRank: viewer.rank,
    currentUserTeamName: viewer.team_name,
    isTeamLeader: isTeamLeader(viewer),
    viewerId: viewer.id,
    scope,
    viewerTeam,
    teamVisibleUserIdsCount: teamVisibleUserIds.length,
    totalUsers: allRows.length,
    scopedUsers: scopedRows.length,
    visibleCount: out.length,
  });
  return out;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const { user, error } = await requireApprovedViewer(authData.user.id);
    if (!user) {
      return NextResponse.json({ error: error ?? "권한이 없습니다." }, { status: 403 });
    }
    const visibleUserIds = await getVisibleUserIdsForViewer({
      id: user.id,
      email: user.email,
      role: user.role,
      rank: user.rank ?? null,
      team_name: user.team_name ?? null,
    });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const roleFilter = searchParams.get("role");
    const allowed =
      statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected"
        ? statusFilter
        : "all";
    const allowedRole = roleFilter === "admin" || roleFilter === "staff" ? roleFilter : "all";

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    let projectRef = "";
    try {
      projectRef = url ? new URL(url).host.split(".")[0] ?? "" : "";
    } catch {
      projectRef = "";
    }
    console.log("[user-approval][GET] env target", { url, projectRef, allowed, allowedRole });

    let query = supabaseAdmin
      .from("users")
      .select("id, email, name, role, rank, team_name, division_name, approval_status, created_at")
      .order("created_at", { ascending: false });
    if (allowedRole !== "all") {
      query = query.eq("role", allowedRole);
    }
    if (visibleUserIds) {
      if (visibleUserIds.length === 0) {
        return NextResponse.json({ users: [], counts: { pending: 0, approved: 0, rejected: 0 }, filter: allowed });
      }
      query = query.in("id", visibleUserIds);
    }
    if (allowed !== "all") {
      // 레거시 행(approval_status null)은 UI·effectiveApproval에서 pending 과 동일 — 승인대기 목록에 포함
      if (allowed === "pending") {
        query = query.or("approval_status.eq.pending,approval_status.is.null");
      } else {
        query = query.eq("approval_status", allowed);
      }
    }

    const { data, error: qErr } = await query;

    if (qErr) {
      console.warn("[user-approval][GET] query failed, return empty list", qErr.message);
      return NextResponse.json({
        users: [],
        counts: { pending: 0, approved: 0, rejected: 0 },
        filter: allowed,
        warning: "직원 목록 조회에 실패하여 빈 목록으로 대체했습니다.",
      });
    }

    const users = (data ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
      rank: string | null;
      team_name: string | null;
      division_name: string | null;
      approval_status: string | null;
      created_at: string;
    }>;
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const u of users) {
      const s = effectiveApproval(u.approval_status);
      counts[s] += 1;
    }
    console.log("[user-approval][GET] raw users response", {
      count: users.length,
      sample: users.slice(0, 5),
      allowed,
      allowedRole,
    });
    return NextResponse.json({ users, counts, filter: allowed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}

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

    const body = (await req.json()) as { userId?: unknown; action?: string; status?: string };
    const userId =
      body.userId == null || body.userId === ""
        ? ""
        : typeof body.userId === "string"
          ? body.userId
          : String(body.userId);
    const action = body.action;
    const nextStatus =
      body.status === "pending" || body.status === "approved" || body.status === "rejected"
        ? body.status
        : action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : null;

    if (!userId || !nextStatus) {
      return NextResponse.json(
        { error: "userId와 status(pending|approved|rejected) 또는 action이 필요합니다." },
        { status: 400 }
      );
    }

    const { data: targetRow, error: tErr } = await supabaseAdmin
      .from("users")
      .select("id, role, approval_status")
      .eq("id", userId)
      .maybeSingle();
    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }
    if (!targetRow) {
      return NextResponse.json({ error: "대상 직원을 찾을 수 없습니다." }, { status: 404 });
    }
    if (targetRow.role !== "staff") {
      return NextResponse.json(
        { error: "직원(staff) 계정의 승인 상태만 이 API에서 변경할 수 있습니다." },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = { approval_status: nextStatus };
    if (nextStatus === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = authData.user.id;
    } else {
      patch.approved_at = null;
      patch.approved_by = null;
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select("id, email, name, approval_status, approved_at, approved_by")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "대상 직원을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
