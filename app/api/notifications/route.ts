import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { getRequesterFromToken } from "./_lib";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const onlyUnread = url.searchParams.get("unread") === "1";

  let query = supabaseAdmin
    .from("notifications")
    .select("id,user_id,type,title,message,data,is_read,created_at")
    .eq("user_id", auth.requester.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyUnread) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "알림 조회에 실패했습니다." }, { status: 500 });
  }

  const { count } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.requester.id)
    .eq("is_read", false);
  const unreadCount = count ?? 0;
  return NextResponse.json({ ok: true, items: data ?? [], unreadCount });
}
