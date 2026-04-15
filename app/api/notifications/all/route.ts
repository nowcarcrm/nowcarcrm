import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { getRequesterFromToken } from "../_lib";

export async function DELETE(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabaseAdmin.from("notifications").delete().eq("user_id", auth.requester.id);
  if (error) {
    return NextResponse.json({ ok: false, error: "전체 알림 삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
