import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const userId = (url.searchParams.get("user_id") ?? "").trim();
  const month = (url.searchParams.get("month") ?? "").trim();

  let query = supabaseAdmin
    .from("settlement_monthly_rates")
    .select("id,user_id,rate_month,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded,created_at,created_by")
    .order("rate_month", { ascending: false })
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("user_id", userId);
  if (month) query = query.eq("rate_month", month);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "월별 요율 이력 조회에 실패했습니다." }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((r) => [String((r as any).user_id ?? ""), String((r as any).created_by ?? "")])
        .filter(Boolean)
    )
  );
  const userById = new Map<string, { name: string; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin.from("users").select("id,name,email").in("id", userIds);
    for (const u of (users ?? []) as Array<any>) {
      userById.set(String(u.id), { name: String(u.name ?? ""), email: String(u.email ?? "") });
    }
  }

  const rows = (data ?? []).map((r) => {
    const row = r as any;
    const owner = userById.get(String(row.user_id));
    const creator = userById.get(String(row.created_by ?? ""));
    return {
      ...row,
      user_name: owner?.name ?? "",
      user_email: owner?.email ?? "",
      created_by_name: creator?.name ?? null,
    };
  });

  return NextResponse.json({ rows });
}
