import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { upsertMonthlyReport } from "@/app/(admin)/_lib/settlement/aggregator";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const BodySchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, "amount는 0이 될 수 없습니다."),
  reason: z.string().trim().min(1, "사유를 입력하세요.").max(500),
  related_month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
});

type ReportRow = {
  id: string;
  user_id: string;
  rate_month: string;
  status: "draft" | "confirmed" | "paid";
};

async function fetchReport(reportId: string): Promise<ReportRow | null> {
  const { data } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("id,user_id,rate_month,status")
    .eq("id", reportId)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

export async function GET(req: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { reportId } = await context.params;
  const report = await fetchReport(reportId);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  const scope = getDeliveryScope(auth.requester);
  if (scope.scope === "own" && scope.user_id !== report.user_id) {
    return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  }
  if (scope.scope === "team") {
    const { data: owner } = await supabaseAdmin
      .from("users")
      .select("team_name")
      .eq("id", report.user_id)
      .maybeSingle();
    if (!owner || String(owner.team_name ?? "") !== scope.team_name) {
      return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("settlement_adjustments")
    .select("id,report_id,amount,reason,related_month,created_at,created_by")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "조정 항목 조회 실패" }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const { reportId } = await context.params;
  const report = await fetchReport(reportId);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  if (report.status === "confirmed") {
    return NextResponse.json({ error: "확정된 월 리포트는 조정할 수 없습니다." }, { status: 400 });
  }

  const { data: adjustment, error: insertErr } = await supabaseAdmin
    .from("settlement_adjustments")
    .insert({
      report_id: reportId,
      amount: Math.round(parsed.data.amount),
      reason: parsed.data.reason,
      related_month: parsed.data.related_month ?? null,
      created_by: auth.requester.id,
    })
    .select("*")
    .maybeSingle();
  if (insertErr || !adjustment) return NextResponse.json({ error: "조정 항목 저장 실패" }, { status: 500 });

  const recompute = await upsertMonthlyReport(report.user_id, report.rate_month, auth.requester.id);
  if (!recompute.ok) {
    return NextResponse.json(
      { error: typeof recompute.error === "string" ? recompute.error : recompute.error.message },
      { status: 400 }
    );
  }

  await logSettlementAudit({
    action: "adjustment_added",
    entityType: "monthly_report",
    entityId: report.id,
    targetUserId: report.user_id,
    performedBy: auth.requester.id,
    details: {
      amount: Math.round(parsed.data.amount),
      reason: parsed.data.reason,
      related_month: parsed.data.related_month ?? null,
    },
  });

  return NextResponse.json({ report: recompute.data, adjustment });
}
