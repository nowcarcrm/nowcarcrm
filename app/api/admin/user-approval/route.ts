import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

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
    .select("id, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { admin: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, role, approval_status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (e2) return { admin: null as null, error: e2.message };
    row = legacy;
  }

  if (!row) return { admin: null as null, error: "직원 계정을 찾을 수 없습니다." };
  if (effectiveApproval(row.approval_status) !== "approved") {
    return { admin: null as null, error: "승인된 관리자만 이 작업을 할 수 있습니다." };
  }
  if (row.role !== "admin") {
    return { admin: null as null, error: "관리자만 직원 승인을 처리할 수 있습니다." };
  }
  return { admin: row, error: null as null };
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

    const { admin, error } = await requireApprovedAdmin(authData.user.id);
    if (!admin) {
      return NextResponse.json({ error: error ?? "권한이 없습니다." }, { status: 403 });
    }

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
      .select("id, email, name, role, approval_status, created_at")
      .order("created_at", { ascending: false });
    if (allowedRole !== "all") {
      query = query.eq("role", allowedRole);
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
      return NextResponse.json({ error: qErr.message }, { status: 400 });
    }

    const users = (data ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
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
