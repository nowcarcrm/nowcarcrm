import { NextResponse } from "next/server";
import { SUPER_ADMIN_EMAIL } from "@/app/(admin)/_lib/rolePermissions";
import {
  classifyDeviceFromUserAgent,
  getCfIpCountry,
  getClientIpFromHeaders,
} from "@/app/_lib/requestClientMeta";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

type Body =
  | { success: false; email: string; failureReason: string }
  | { success: true; accessToken: string };

async function notifySuperAdminsDualLogin(employeeName: string) {
  const title = "⚠️ 이중 로그인 감지";
  const message = `[${employeeName}] 이중 로그인 감지`;
  const { data: byRole } = await supabaseAdmin
    .from("users")
    .select("id")
    .or("role.eq.super_admin,rank.eq.총괄대표");
  const { data: byEmail } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", SUPER_ADMIN_EMAIL);
  const ids = [
    ...new Set(
      [...(byRole ?? []), ...(byEmail ?? [])].map((r) => (r as { id: string }).id).filter(Boolean)
    ),
  ];
  for (const user_id of ids) {
    await supabaseAdmin.from("notifications").insert({
      user_id,
      type: "security-dual-login",
      title,
      message,
      is_read: false,
      data: { eventType: "security-dual-login" },
    });
  }
}

export async function POST(req: Request) {
  const h = req.headers;
  const ip = getClientIpFromHeaders(h);
  const ua = h.get("user-agent");
  const device = classifyDeviceFromUserAgent(ua);
  const cfCountry = getCfIpCountry(h);
  const foreignIpWarning = cfCountry != null && cfCountry !== "" && cfCountry !== "KR";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (body.success === false) {
    const email = (body.email ?? "").trim().toLowerCase();
    const failureReason = (body.failureReason ?? "").trim() || "로그인 실패";
    if (!email) {
      return NextResponse.json({ ok: true });
    }
    const { data: u } = await supabaseAdmin.from("users").select("id").eq("email", email).maybeSingle();
    const userId = (u as { id?: string } | null)?.id ?? null;

    const { data: guard } = await supabaseAdmin
      .from("email_login_guard")
      .select("consecutive_failures")
      .eq("email_normalized", email)
      .maybeSingle();
    const prev = (guard as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0;
    const nextFail = prev + 1;
    const lockedUntil =
      nextFail >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
    await supabaseAdmin.from("email_login_guard").upsert(
      {
        email_normalized: email,
        consecutive_failures: nextFail,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_normalized" }
    );

    await supabaseAdmin.from("login_logs").insert({
      user_id: userId,
      attempted_email: email,
      ip_address: ip,
      user_agent: ua,
      device_info: device,
      login_status: "failed",
      failure_reason: failureReason,
      foreign_ip_warning: foreignIpWarning,
    });

    return NextResponse.json({ ok: true });
  }

  const token = (body as { accessToken?: string }).accessToken?.trim();
  if (!token) {
    return NextResponse.json({ error: "토큰 없음" }, { status: 400 });
  }
  const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "유효하지 않은 세션" }, { status: 401 });
  }

  const { data: row, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id, email, name")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (userErr || !row) {
    return NextResponse.json({ error: "직원 프로필 없음" }, { status: 403 });
  }
  const user = row as { id: string; email: string | null; name: string | null };
  const normEmail = (user.email ?? authData.user.email ?? "").trim().toLowerCase();
  const guardKey = normEmail || `user:${user.id}`;

  await supabaseAdmin.from("email_login_guard").upsert(
    {
      email_normalized: guardKey,
      consecutive_failures: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email_normalized" }
  );

  await supabaseAdmin.from("login_logs").insert({
    user_id: user.id,
    attempted_email: normEmail || null,
    ip_address: ip,
    user_agent: ua,
    device_info: device,
    login_status: "success",
    failure_reason: null,
    foreign_ip_warning: foreignIpWarning,
  });

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("login_logs")
    .select("ip_address")
    .eq("user_id", user.id)
    .eq("login_status", "success")
    .gte("login_at", tenMinAgo);
  const ips = new Set(
    (recent ?? [])
      .map((r) => (r as { ip_address?: string | null }).ip_address)
      .filter((x): x is string => !!x && x.trim() !== "")
  );
  if (ips.size >= 2) {
    await notifySuperAdminsDualLogin(user.name?.trim() || normEmail || "직원");
  }

  return NextResponse.json({ ok: true });
}
