import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import type { MonthlyReportWithUser } from "@/app/(admin)/_types/settlement";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const month = (url.searchParams.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식이 올바르지 않습니다." }, { status: 400 });

  const requestedUserId = (url.searchParams.get("user_id") ?? "").trim();
  const scope = getDeliveryScope(auth.requester);

  let query = supabaseAdmin
    .from("settlement_monthly_reports")
    .select(
      "id,user_id,rate_month,total_ag_commission,total_dealer_commission,total_etc_revenue,total_revenue,total_customer_support,net_revenue,base_rate,eligible_incentive,incentive_tier,incentive_rate,rate_based_amount,support_50_amount,adjustment_amount,prepayment_amount,final_amount,status,confirmed_at,confirmed_by,paid_at,locked_at,created_at,updated_at"
    )
    .eq("rate_month", month);

  if (requestedUserId) query = query.eq("user_id", requestedUserId);
  if (scope.scope === "own") query = query.eq("user_id", scope.user_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "정산 리포트 조회 실패" }, { status: 500 });

  const baseRows = (data ?? []) as MonthlyReportWithUser[];
  const userIds = Array.from(new Set(baseRows.map((r) => r.user_id)));
  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id,name,email,rank,team_name").in("id", userIds)
    : { data: [] as any[] };
  const userById = new Map((users ?? []).map((u: any) => [String(u.id), u]));

  const rows = baseRows
    .map((r) => {
      const u = userById.get(r.user_id);
      return {
        ...r,
        user_name: String(u?.name ?? "(알수없음)"),
        user_email: String(u?.email ?? ""),
        user_rank: String(u?.rank ?? ""),
        user_team_name: u?.team_name == null ? null : String(u.team_name),
      };
    })
    .filter((r) => {
      if (scope.scope !== "team") return true;
      return r.user_team_name === scope.team_name;
    })
    .sort((a, b) => `${a.user_team_name ?? ""}|${a.user_rank}|${a.user_name}`.localeCompare(`${b.user_team_name ?? ""}|${b.user_rank}|${b.user_name}`, "ko"));

  return NextResponse.json({ rows });
}
