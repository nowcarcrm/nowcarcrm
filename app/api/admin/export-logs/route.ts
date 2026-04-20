import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

/** 월별(YYYY-MM)보내기 통계·비정상 패턴(1일 5회 이상) */
export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const ym = (url.searchParams.get("month") ?? "").trim();
  const now = new Date();
  const month =
    ym && /^\d{4}-\d{2}$/.test(ym)
      ? ym
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const startIso = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();

  const { data: logs, error } = await supabaseAdmin
    .from("export_logs")
    .select("id, user_id, export_type, exported_count, file_name, exported_at, ip_address")
    .gte("exported_at", startIso)
    .lte("exported_at", endIso)
    .order("exported_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  const rows = logs ?? [];
  const byUser = new Map<string, number>();
  const byDay = new Map<string, number>();
  const dayUserCounts = new Map<string, number>();
  for (const r of rows as { user_id: string; exported_at: string }[]) {
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    const d = r.exported_at.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
    const dk = `${d}|${r.user_id}`;
    dayUserCounts.set(dk, (dayUserCounts.get(dk) ?? 0) + 1);
  }
  const anomalies: { userId: string; day: string; count: number }[] = [];
  for (const [dk, c] of dayUserCounts) {
    if (c >= 5) {
      const [day, userId] = dk.split("|");
      anomalies.push({ userId, day, count: c });
    }
  }
  const userIds = [...new Set(rows.map((r) => (r as { user_id: string }).user_id))];
  let names = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await supabaseAdmin.from("users").select("id,name").in("id", userIds);
    names = new Map((users ?? []).map((u) => [String((u as { id: string }).id), String((u as { name?: string }).name ?? "")]));
  }
  const byUserWithName = [...byUser.entries()]
    .map(([userId, count]) => ({ userId, count, name: names.get(userId) ?? "—" }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    month,
    totalExports: rows.length,
    byUser: byUserWithName,
    byDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    anomalies,
    recent: rows.slice(0, 100),
  });
}
