/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { upsertMonthlyReport } from "@/app/(admin)/_lib/settlement/aggregator";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const BodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

type UserRow = { id: string; name: string | null };

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: templates, error } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("user_id,is_excluded,users!inner(id,name)")
    .eq("is_excluded", false);
  if (error) return NextResponse.json({ error: "대상자 조회 실패" }, { status: 500 });

  const targets = (templates ?? []).map((t: any) => ({
    user_id: String(t.user_id),
    user_name: String(((t.users ?? {}) as UserRow).name ?? "직원"),
  }));

  const settled = await Promise.allSettled(
    targets.map(async (t) => {
      const result = await upsertMonthlyReport(t.user_id, parsed.data.month, auth.requester.id);
      if (!result.ok) return { ...t, error: typeof result.error === "string" ? result.error : result.error.message };
      await logSettlementAudit({
        action: "report_computed",
        entityType: "monthly_report",
        entityId: String(result.data?.id ?? ""),
        targetUserId: t.user_id,
        performedBy: auth.requester.id,
        details: { user_id: t.user_id, month: parsed.data.month, final_amount: result.calculation.final_amount, bulk: true },
      });
      return { ...t, final_amount: result.calculation.final_amount };
    })
  );

  const results = settled.map((r, idx) => {
    if (r.status === "fulfilled") return r.value;
    return { ...targets[idx], error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });
  const success = results.filter((r) => !("error" in r)).length;
  const failed = results.length - success;

  return NextResponse.json({ total: results.length, success, failed, results });
}
