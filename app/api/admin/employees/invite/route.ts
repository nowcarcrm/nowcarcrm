import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { effectiveRole } from "@/app/(admin)/_lib/rolePermissions";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function requireAdmin(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, email, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { ok: false as const, error: e1.message };
  const row = byId;
  if (!row) return { ok: false as const, error: "직원 계정을 찾을 수 없습니다." };
  const role = effectiveRole({ role: row.role, email: row.email });
  if (role !== "super_admin" && role !== "admin") {
    return { ok: false as const, error: "관리자만 사용할 수 있습니다." };
  }
  const status = row.approval_status ?? "pending";
  if (status !== "approved") {
    return { ok: false as const, error: "승인된 관리자만 사용할 수 있습니다." };
  }
  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }
    const check = await requireAdmin(authData.user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });

    const body = (await req.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/login`,
      },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      email,
      actionLink: data?.properties?.action_link ?? null,
      masked: "보안상 링크는 관리자에게만 표시됩니다.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "서버 오류" },
      { status: 500 }
    );
  }
}

