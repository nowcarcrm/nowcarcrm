import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const BodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

type ReportRef = { id: string; user_id: string };

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const month = parsed.data.month;

  const { data: draftRows, error: draftErr } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("id,user_id")
    .eq("rate_month", month)
    .eq("status", "draft");
  if (draftErr) return NextResponse.json({ error: "확정 대상 조회 실패" }, { status: 500 });
  const targets = (draftRows ?? []) as ReportRef[];
  if (targets.length === 0) return NextResponse.json({ confirmed_count: 0, month });

  const ids = targets.map((r) => r.id);
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .update({
      status: "confirmed",
      confirmed_at: nowIso,
      confirmed_by: auth.requester.id,
      locked_at: nowIso,
      updated_at: nowIso,
    })
    .in("id", ids);
  if (updateErr) return NextResponse.json({ error: "월 확정 처리 실패" }, { status: 500 });

  await Promise.all(
    targets.map((r) =>
      logSettlementAudit({
        action: "report_confirmed",
        entityType: "monthly_report",
        entityId: r.id,
        targetUserId: r.user_id,
        performedBy: auth.requester.id,
        details: { month },
      })
    )
  );

  return NextResponse.json({ confirmed_count: targets.length, month });
}
