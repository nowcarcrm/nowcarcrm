import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const PAGE_SIZE = 20;

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const userIdFilter = (url.searchParams.get("userId") ?? "").trim();
  const from = (url.searchParams.get("from") ?? "").trim();
  const to = (url.searchParams.get("to") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();

  let q = supabaseAdmin.from("login_logs").select("*", { count: "exact" }).order("login_at", { ascending: false });
  if (userIdFilter) q = q.eq("user_id", userIdFilter);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    q = q.gte("login_at", `${from}T00:00:00.000Z`);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    q = q.lte("login_at", `${to}T23:59:59.999Z`);
  }
  if (status === "success" || status === "failed") q = q.eq("login_status", status);

  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;
  const { data: rows, error, count } = await q.range(fromIdx, toIdx);
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  const logs = rows ?? [];
  const userIds = [...new Set(logs.map((l) => (l as { user_id?: string | null }).user_id).filter(Boolean))] as string[];
  let userMap = new Map<string, { name: string | null; rank: string | null; role: string | null }>();
  if (userIds.length) {
    const { data: users } = await supabaseAdmin.from("users").select("id,name,rank,role").in("id", userIds);
    userMap = new Map(
      (users ?? []).map((u) => [
        String((u as { id: string }).id),
        {
          name: (u as { name?: string | null }).name ?? null,
          rank: (u as { rank?: string | null }).rank ?? null,
          role: (u as { role?: string | null }).role ?? null,
        },
      ])
    );
  }
  const items = logs.map((raw) => {
    const l = raw as Record<string, unknown>;
    const uid = (l.user_id as string | null) ?? null;
    const u = uid ? userMap.get(uid) : undefined;
    return {
      ...l,
      staffName: u?.name ?? (l.attempted_email ? String(l.attempted_email) : "—"),
      staffRank: u?.rank ?? "—",
      staffRole: u?.role ?? "—",
    };
  });
  return NextResponse.json({
    items,
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
  });
}
