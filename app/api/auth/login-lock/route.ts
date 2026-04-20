import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  const { data, error } = await supabaseAdmin
    .from("email_login_guard")
    .select("locked_until")
    .eq("email_normalized", email)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  const until = (data as { locked_until?: string | null } | null)?.locked_until;
  if (!until) {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  const t = new Date(until).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  return NextResponse.json(
    {
      locked: true,
      lockedUntil: until,
      message: "연속 로그인 실패로 10분간 로그인이 제한됩니다.",
    },
    { status: 423 }
  );
}
