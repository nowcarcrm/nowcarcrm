import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { triggerReportRecompute } from "@/app/(admin)/_lib/settlement/reportTrigger";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const BodySchema = z.object({
  upload_id: z.string().uuid(),
  decisions: z.array(
    z.object({
      delivery_id: z.string().uuid(),
      dealer_commission: z.number(),
      dealer_settlement_month: z.string().regex(/^\d{4}-\d{2}$/),
    })
  ),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  let applied = 0;
  const recomputedMonths = new Set<string>();
  for (const d of parsed.data.decisions) {
    const { data: delivery } = await supabaseAdmin
      .from("settlement_deliveries")
      .select("id,owner_id,status,ag_settlement_month,dealer_settlement_month,version")
      .eq("id", d.delivery_id)
      .maybeSingle();
    if (!delivery) continue;

    const { data: confirmedReport } = await supabaseAdmin
      .from("settlement_monthly_reports")
      .select("id")
      .eq("user_id", String((delivery as any).owner_id))
      .eq("rate_month", d.dealer_settlement_month)
      .eq("status", "confirmed")
      .maybeSingle();
    if (confirmedReport) {
      continue;
    }

    const roundedAmount = Math.round(Number(d.dealer_commission ?? 0));
    const { error } = await supabaseAdmin
      .from("settlement_deliveries")
      .update({
        dealer_commission: roundedAmount,
        dealer_settlement_month: d.dealer_settlement_month,
        version: Number((delivery as any).version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", d.delivery_id);
    if (error) continue;

    await triggerReportRecompute({
      deliveryId: d.delivery_id,
      ownerId: String((delivery as any).owner_id),
      agMonth: String((delivery as any).ag_settlement_month ?? ""),
      dealerMonth: d.dealer_settlement_month,
      performedBy: auth.requester.id,
    });
    recomputedMonths.add(d.dealer_settlement_month);
    applied += 1;

    await logSettlementAudit({
      action: "dealer_commission_added",
      entityType: "delivery",
      entityId: d.delivery_id,
      targetUserId: String((delivery as any).owner_id),
      performedBy: auth.requester.id,
      details: { dealer_commission: roundedAmount, dealer_settlement_month: d.dealer_settlement_month },
    });
  }

  await supabaseAdmin.from("settlement_dealer_uploads").update({ status: "applied" }).eq("id", parsed.data.upload_id);
  return NextResponse.json({ applied, recomputed_months: Array.from(recomputedMonths) });
}
