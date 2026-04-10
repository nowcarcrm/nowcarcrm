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
  return "approved";
}

async function requireApprovedAdmin(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, is_active, approval_status")
    .eq("id", authUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (e1) return { admin: null as null, error: e1.message };

  let row = byId;
  if (!row) {
    const { data: legacy, error: e2 } = await supabaseAdmin
      .from("users")
      .select("id, role, is_active, approval_status")
      .eq("auth_user_id", authUserId)
      .eq("is_active", true)
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

    const { data, error: qErr } = await supabaseAdmin
      .from("users")
      .select("id, email, name, role, approval_status, created_at, is_active")
      .eq("approval_status", "pending")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 400 });
    }

    return NextResponse.json({ users: data ?? [] });
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

    const body = (await req.json()) as { userId?: string; action?: string };
    const userId = body.userId?.trim();
    const action = body.action;
    if (!userId || (action !== "approve" && action !== "reject")) {
      return NextResponse.json(
        { error: "userId와 action(approve|reject)이 필요합니다." },
        { status: 400 }
      );
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("users")
      .update({ approval_status: nextStatus })
      .eq("id", userId)
      .eq("approval_status", "pending")
      .select("id, email, name, approval_status")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "승인 대기 상태인 직원만 처리할 수 없거나 이미 처리되었습니다." },
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
