import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { notifyDisputeCreated } from "@/app/(admin)/_lib/settlement/notifications";

const PostSchema = z.object({
  report_id: z.string().uuid(),
  content: z.string().trim().min(1).max(500),
});

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const reportId = (new URL(req.url).searchParams.get("report_id") ?? "").trim();
  if (!reportId) return NextResponse.json({ error: "report_id가 필요합니다." }, { status: 400 });

  const { data: report } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("id,user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  const scope = getDeliveryScope(auth.requester);
  if (scope.scope === "own" && scope.user_id !== String((report as any).user_id)) {
    return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  }
  if (scope.scope === "team") {
    const { data: target } = await supabaseAdmin.from("users").select("team_name").eq("id", (report as any).user_id).maybeSingle();
    if (!target || String(target.team_name ?? "") !== scope.team_name) {
      return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("settlement_disputes")
    .select("id,report_id,submitted_by,content,status,response,resolved_at,resolved_by,created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "이의 제기 조회 실패" }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = PostSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: report } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("id,user_id")
    .eq("id", parsed.data.report_id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  if (String((report as any).user_id) !== auth.requester.id) {
    return NextResponse.json({ error: "본인 정산서에만 이의 제기할 수 있습니다." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("settlement_disputes")
    .insert({
      report_id: parsed.data.report_id,
      submitted_by: auth.requester.id,
      content: parsed.data.content,
      status: "pending",
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "이의 제기 등록 실패" }, { status: 500 });

  const { data: superAdmin } = await supabaseAdmin
    .from("users")
    .select("id")
    .or("role.eq.super_admin")
    .limit(1)
    .maybeSingle();
  if (superAdmin?.id) {
    await notifyDisputeCreated(String((data as any).id), parsed.data.report_id, auth.requester.name ?? "직원", superAdmin.id);
  }

  await logSettlementAudit({
    action: "dispute_created",
    entityType: "dispute",
    entityId: String((data as any).id),
    targetUserId: String((report as any).user_id),
    performedBy: auth.requester.id,
    details: { report_id: parsed.data.report_id },
  });

  return NextResponse.json({ dispute: data });
}
