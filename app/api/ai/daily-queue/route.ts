import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { fetchDailyQueueForUser } from "@/app/_lib/aiBatchAnalysis";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const requestedUserId = (url.searchParams.get("userId") ?? "").trim();
  const date = (url.searchParams.get("date") ?? "").trim() || undefined;
  const targetUserId = requestedUserId || auth.requester.id;

  if (targetUserId !== auth.requester.id && auth.requester.role !== "admin" && auth.requester.role !== "super_admin") {
    return NextResponse.json({ error: "본인 큐만 조회할 수 있습니다." }, { status: 403 });
  }

  try {
    const queue = await fetchDailyQueueForUser(targetUserId, date);
    return NextResponse.json({ ok: true, ...queue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "큐 조회 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
