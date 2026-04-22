import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { upsertMonthlyReport } from "@/app/(admin)/_lib/settlement/aggregator";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const result = await upsertMonthlyReport(parsed.data.user_id, parsed.data.month, auth.requester.id);
  if (!result.ok) {
    return NextResponse.json({ error: typeof result.error === "string" ? result.error : result.error.message }, { status: 400 });
  }

  await logSettlementAudit({
    action: "report_computed",
    entityType: "monthly_report",
    entityId: String(result.data?.id ?? ""),
    targetUserId: parsed.data.user_id,
    performedBy: auth.requester.id,
    details: {
      user_id: parsed.data.user_id,
      month: parsed.data.month,
      final_amount: result.calculation.final_amount,
    },
  });

  return NextResponse.json({ report: result.data, calculation: result.calculation });
}
