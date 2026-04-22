import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { triggerReportRecompute } from "@/app/(admin)/_lib/settlement/reportTrigger";

const BodySchema = z.object({
  upload_id: z.string().uuid(),
  decisions: z.array(
    z.object({
      delivery_id: z.string().uuid(),
      action: z.enum(["confirm", "carry_over"]),
      target_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
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
  const failed: Array<{ delivery_id: string; error: string }> = [];
  for (const d of parsed.data.decisions) {
    try {
      const { data: row } = await supabaseAdmin
        .from("settlement_deliveries")
        .select("id,owner_id,status,ag_settlement_month,dealer_settlement_month,version")
        .eq("id", d.delivery_id)
        .maybeSingle();
      if (!row) throw new Error("출고 건 없음");
      const status = String((row as any).status);
      if (!["approved_director", "modilca_submitted", "confirmed", "carried_over"].includes(status)) {
        throw new Error("확정/이월 처리 가능한 상태가 아닙니다.");
      }
      if (d.action === "confirm") {
        await supabaseAdmin
          .from("settlement_deliveries")
          .update({
            status: "confirmed",
            version: Number((row as any).version ?? 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", d.delivery_id);
        await triggerReportRecompute({
          deliveryId: d.delivery_id,
          ownerId: String((row as any).owner_id),
          agMonth: String((row as any).ag_settlement_month ?? ""),
          dealerMonth: String((row as any).dealer_settlement_month ?? ""),
          performedBy: auth.requester.id,
        });
        await logSettlementAudit({
          action: "modilca_confirmed",
          entityType: "delivery",
          entityId: d.delivery_id,
          targetUserId: String((row as any).owner_id),
          performedBy: auth.requester.id,
        });
      } else {
        if (!d.target_month) throw new Error("이월 시 target_month가 필요합니다.");
        const previousAgMonth = String((row as any).ag_settlement_month ?? "");
        await supabaseAdmin
          .from("settlement_deliveries")
          .update({
            status: "carried_over",
            ag_settlement_month: d.target_month,
            version: Number((row as any).version ?? 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", d.delivery_id);
        await triggerReportRecompute({
          deliveryId: d.delivery_id,
          ownerId: String((row as any).owner_id),
          agMonth: previousAgMonth || null,
          dealerMonth: d.target_month,
          performedBy: auth.requester.id,
        });
        await logSettlementAudit({
          action: "modilca_carried_over",
          entityType: "delivery",
          entityId: d.delivery_id,
          targetUserId: String((row as any).owner_id),
          performedBy: auth.requester.id,
          details: { target_month: d.target_month },
        });
      }
      applied += 1;
    } catch (e) {
      failed.push({ delivery_id: d.delivery_id, error: e instanceof Error ? e.message : "처리 실패" });
    }
  }

  await supabaseAdmin
    .from("settlement_modilca_uploads")
    .update({ status: "applied", notes: JSON.stringify({ failed }) })
    .eq("id", parsed.data.upload_id);

  return NextResponse.json({ applied, failed });
}
