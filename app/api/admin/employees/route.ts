import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

type CreateEmployeeBody = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "staff";
  approval_status?: "pending" | "approved" | "rejected";
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function effectiveApproval(status: string | null | undefined): "pending" | "approved" | "rejected" {
  if (status === "pending" || status === "rejected" || status === "approved") return status;
  return "pending";
}

/** 신규 스키마(users.id = auth id) + 레거시(auth_user_id) 모두 지원 */
async function getRequesterRow(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { row: null, error: e1 };
  if (byId) return { row: byId, error: null };

  const { data: legacy, error: e2 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return { row: legacy, error: e2 };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }

    const { data: authData, error: authErr } =
      await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const { row: requester, error: requesterErr } = await getRequesterRow(authData.user.id);
    if (requesterErr || !requester) {
      return NextResponse.json({ error: "직원 계정 확인에 실패했습니다." }, { status: 403 });
    }
    if (effectiveApproval(requester.approval_status) !== "approved") {
      return NextResponse.json(
        { error: "승인된 관리자만 직원 계정을 생성할 수 있습니다." },
        { status: 403 }
      );
    }
    if (requester.role !== "admin") {
      return NextResponse.json(
        { error: "관리자만 직원 계정을 생성할 수 있습니다." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as CreateEmployeeBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const name = body.name?.trim();
    const role = body.role;
    const approval_status =
      body.approval_status === "pending" ||
      body.approval_status === "approved" ||
      body.approval_status === "rejected"
        ? body.approval_status
        : "approved";

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "email, password, name, role은 필수입니다." },
        { status: 400 }
      );
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, admin_created: "true" },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Auth 사용자 생성 실패" },
        { status: 400 }
      );
    }

    const authId = created.user.id;

    const baseRow = {
      id: authId,
      name,
      role,
      email,
      approval_status,
    };

    let { data: userRow, error: insertErr } = await supabaseAdmin
      .from("users")
      .insert(baseRow)
      .select("id, email, name, role")
      .single();

    if (insertErr) {
      const { data: row2, error: err2 } = await supabaseAdmin
        .from("users")
        .insert({
          auth_user_id: authId,
          email,
          name,
          role,
          approval_status,
        })
        .select("id, email, name, role")
        .single();
      userRow = row2;
      insertErr = err2;
    }

    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(authId);
      return NextResponse.json(
        { error: `users 테이블 연결 실패: ${insertErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, user: userRow });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
