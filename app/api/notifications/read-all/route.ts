import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { getRequesterFromToken } from "../_lib";

export async function PUT(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", auth.requester.id)
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ error: "전체 읽음 처리에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
