import { NextResponse } from "next/server";
import { pickPostgrestFields } from "@/app/_lib/postgrestError";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function terminalApproval(status: string | null | undefined): boolean {
  return status === "approved" || status === "rejected";
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function initialAnnualLeaveByJoinMonth(baseDate = new Date()): number {
  const joinMonth = baseDate.getMonth() + 1;
  return Math.max(0, 12 - joinMonth);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const body = (await req.json()) as { authUserId?: unknown; email?: string; name?: string };
    const authUserId =
      body.authUserId == null || body.authUserId === ""
        ? ""
        : typeof body.authUserId === "string"
          ? body.authUserId
          : String(body.authUserId);
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!authUserId || !email) {
      return NextResponse.json({ error: "authUserId와 email이 필요합니다." }, { status: 400 });
    }
    if (authData.user.id !== authUserId) {
      return NextResponse.json({ error: "본인 계정만 처리할 수 있습니다." }, { status: 403 });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("users")
      .select("id, role, approval_status")
      .eq("id", authUserId)
      .maybeSingle();
    if (exErr) {
      const exFields = pickPostgrestFields(exErr);
      console.error("[ensure-signup-profile] existing row select failed", { ...exFields, raw: exErr });
      return NextResponse.json(
        { ok: false, error: exErr.message, ...exFields },
        { status: 400 }
      );
    }
    if (existing && existing.role !== "staff") {
      return NextResponse.json(
        { error: "기존 관리자 계정은 공개 가입 API로 변경할 수 없습니다." },
        { status: 403 }
      );
    }
    if (existing && terminalApproval(existing.approval_status)) {
      return NextResponse.json({ ok: true, row: existing, noop: true });
    }

    const payload = {
      id: authUserId,
      auth_user_id: authUserId,
      email,
      name: name || email.split("@")[0] || "staff",
      role: "staff" as const,
      approval_status: "pending" as const,
      is_active: true,
      remaining_annual_leave: initialAnnualLeaveByJoinMonth(),
    };
    console.log("[ensure-signup-profile] upsert start", { payload });
    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) {
      const fields = pickPostgrestFields(error);
      console.error("[ensure-signup-profile] upsert failed", {
        ...fields,
        payload,
        raw: error,
      });
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          ...fields,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}

