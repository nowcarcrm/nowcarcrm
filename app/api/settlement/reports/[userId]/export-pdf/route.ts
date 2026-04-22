import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { generatePersonalReportPDF } from "@/app/(admin)/_lib/settlement/pdfExporter";
import type { Adjustment, DeliveryWithNames, MonthlyReportWithUser } from "@/app/(admin)/_types/settlement";

type UserRow = { id: string; name: string | null; email: string | null; rank: string | null; team_name: string | null };

export async function GET(req: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId } = await context.params;
  const month = (new URL(req.url).searchParams.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식이 올바르지 않습니다." }, { status: 400 });

  const scope = getDeliveryScope(auth.requester);
  if (scope.scope === "own" && scope.user_id !== userId) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data: targetUser } = await supabaseAdmin.from("users").select("id,name,email,rank,team_name").eq("id", userId).maybeSingle();
  if (!targetUser) return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 404 });
  const user = targetUser as UserRow;
  if (scope.scope === "team" && scope.team_name !== String(user.team_name ?? "")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { data: rawReport, error: reportErr } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select(
      "id,user_id,rate_month,total_ag_commission,total_dealer_commission,total_etc_revenue,total_revenue,total_customer_support,net_revenue,base_rate,eligible_incentive,incentive_tier,incentive_rate,rate_based_amount,support_50_amount,adjustment_amount,prepayment_amount,final_amount,status,confirmed_at,confirmed_by,paid_at,locked_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("rate_month", month)
    .maybeSingle();
  if (reportErr) return NextResponse.json({ error: "정산서 조회 실패" }, { status: 500 });
  if (!rawReport) return NextResponse.json({ error: "정산서가 없습니다." }, { status: 404 });

  const report: MonthlyReportWithUser = {
    ...(rawReport as Omit<MonthlyReportWithUser, "user_name" | "user_email" | "user_rank" | "user_team_name">),
    user_name: String(user.name ?? "(알수없음)"),
    user_email: String(user.email ?? ""),
    user_rank: String(user.rank ?? ""),
    user_team_name: user.team_name == null ? null : String(user.team_name),
  };

  const { data: rawDeliveries, error: delErr } = await supabaseAdmin
    .from("settlement_deliveries")
    .select("*")
    .eq("owner_id", userId)
    .or(`ag_settlement_month.eq.${month},dealer_settlement_month.eq.${month}`)
    .in("status", ["approved_director", "modilca_submitted", "confirmed"])
    .is("deleted_at", null)
    .order("delivery_date", { ascending: true });
  if (delErr) return NextResponse.json({ error: "출고 내역 조회 실패" }, { status: 500 });
  const deliveries: DeliveryWithNames[] = (rawDeliveries ?? []).map((d) => ({
    ...(d as DeliveryWithNames),
    owner_name: String(user.name ?? ""),
    owner_email: String(user.email ?? ""),
    created_by_name: "",
  }));

  const { data: rawAdjustments, error: adjErr } = await supabaseAdmin
    .from("settlement_adjustments")
    .select("id,report_id,amount,reason,related_month,created_at,created_by")
    .eq("report_id", String(rawReport.id))
    .order("created_at", { ascending: true });
  if (adjErr) return NextResponse.json({ error: "조정 항목 조회 실패" }, { status: 500 });

  const buffer = generatePersonalReportPDF(report, deliveries, (rawAdjustments ?? []) as Adjustment[]);
  const fileName = `정산서_${report.user_name}_${month}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
