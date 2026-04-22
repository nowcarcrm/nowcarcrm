import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isCeo, isDirector } from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { generateMonthlyOverviewExcel } from "@/app/(admin)/_lib/settlement/excelExporter";
import type { MonthlyReportWithUser } from "@/app/(admin)/_types/settlement";

type UserRow = { id: string; name: string | null; email: string | null; rank: string | null; team_name: string | null };

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(isSuperAdmin(auth.requester) || isDirector(auth.requester) || isCeo(auth.requester))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const month = (new URL(req.url).searchParams.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: reportsRaw, error } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select(
      "id,user_id,rate_month,total_ag_commission,total_dealer_commission,total_etc_revenue,total_revenue,total_customer_support,net_revenue,base_rate,eligible_incentive,incentive_tier,incentive_rate,rate_based_amount,support_50_amount,adjustment_amount,prepayment_amount,final_amount,status,confirmed_at,confirmed_by,paid_at,locked_at,created_at,updated_at"
    )
    .eq("rate_month", month);
  if (error) return NextResponse.json({ error: "정산 리포트 조회 실패" }, { status: 500 });

  const reports = (reportsRaw ?? []) as MonthlyReportWithUser[];
  const userIds = Array.from(new Set(reports.map((r) => r.user_id)));
  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id,name,email,rank,team_name").in("id", userIds)
    : { data: [] as UserRow[] };
  const userById = new Map((users ?? []).map((u) => [String(u.id), u as UserRow]));

  const rows = reports
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
    .sort((a, b) =>
      `${a.user_team_name ?? ""}|${a.user_rank}|${a.user_name}`.localeCompare(`${b.user_team_name ?? ""}|${b.user_rank}|${b.user_name}`, "ko")
    );

  const buffer = generateMonthlyOverviewExcel(rows, month);
  const fileName = `월별정산_${month}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
