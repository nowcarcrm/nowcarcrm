import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const body = (await req.json()) as { authUserId?: string; email?: string; name?: string };
    const authUserId = body.authUserId?.trim();
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!authUserId || !email) {
      return NextResponse.json({ error: "authUserId와 email이 필요합니다." }, { status: 400 });
    }
    if (authData.user.id !== authUserId) {
      return NextResponse.json({ error: "본인 계정만 처리할 수 있습니다." }, { status: 403 });
    }

    const payload = {
      id: authUserId,
      auth_user_id: authUserId,
      email,
      name: name || email.split("@")[0] || "staff",
      role: "staff",
      approval_status: "pending",
    };
    console.log("[ensure-signup-profile] upsert start", { payload });
    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) {
      console.error("[ensure-signup-profile] upsert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}

