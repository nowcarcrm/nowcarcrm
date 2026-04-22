import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { canApproveAsDirector, canApproveAsLeader } from "@/app/(admin)/_lib/settlement/permissions";
import { findDirectorId } from "@/app/(admin)/_lib/settlement/approvalHelpers";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { notifyDeliveryApproved, notifyDeliverySubmitted } from "@/app/(admin)/_lib/settlement/notifications";
import { triggerReportRecompute } from "@/app/(admin)/_lib/settlement/reportTrigger";
import type { Delivery } from "@/app/(admin)/_types/settlement";

const BodySchema = z.object({
  version: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const { id } = await context.params;

  const { data: deliveryRaw } = await supabaseAdmin.from("settlement_deliveries").select("*").eq("id", id).maybeSingle();
  const delivery = deliveryRaw as Delivery | null;
  if (!delivery) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });

  let nextStatus: Delivery["status"] | null = null;
  let level: "team_leader" | "director" = "team_leader";
  if (delivery.status === "pending_leader") {
    if (!canApproveAsLeader(auth.requester, delivery)) return NextResponse.json({ error: "승인 권한이 없습니다." }, { status: 403 });
    nextStatus = "pending_director";
    level = "team_leader";
  } else if (delivery.status === "pending_director") {
    if (!canApproveAsDirector(auth.requester, delivery)) return NextResponse.json({ error: "승인 권한이 없습니다." }, { status: 403 });
    nextStatus = "approved_director";
    level = "director";
  } else {
    return NextResponse.json({ error: "현재 상태에서는 승인할 수 없습니다." }, { status: 400 });
  }

  if (delivery.version !== parsed.data.version) {
    return NextResponse.json({ error: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요." }, { status: 409 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("settlement_deliveries")
    .update({ status: nextStatus, version: delivery.version + 1, updated_at: new Date().toISOString() })
    .eq("id", delivery.id)
    .eq("version", delivery.version)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) return NextResponse.json({ error: "상태 변경에 실패했습니다." }, { status: 409 });

  await supabaseAdmin.from("settlement_approvals").insert({
    delivery_id: delivery.id,
    approver_id: auth.requester.id,
    approval_level: level,
    action: "approve",
    notes: parsed.data.notes?.trim() || null,
  });

  await logSettlementAudit({
    action: "delivery_approved",
    entityType: "delivery",
    entityId: delivery.id,
    targetUserId: delivery.owner_id,
    performedBy: auth.requester.id,
    details: { from_status: delivery.status, to_status: nextStatus, approval_level: level, notes: parsed.data.notes ?? null },
  });

  try {
    if (nextStatus === "pending_director") {
      const directorId = await findDirectorId();
      if (directorId) {
        await notifyDeliverySubmitted(delivery.id, delivery.customer_name, String(auth.requester.name ?? "승인자"), directorId, "director");
      }
    } else if (nextStatus === "approved_director") {
      await notifyDeliveryApproved(
        delivery.id,
        delivery.customer_name,
        delivery.owner_id,
        String(auth.requester.name ?? "승인자"),
        nextStatus
      );
      void triggerReportRecompute({
        deliveryId: delivery.id,
        ownerId: delivery.owner_id,
        agMonth: delivery.ag_settlement_month,
        dealerMonth: delivery.dealer_settlement_month,
        performedBy: auth.requester.id,
      }).catch((e) => {
        console.error("[REPORT RECOMPUTE FAIL]", e);
      });
    }
  } catch {
    // 알림 실패 무시
  }

  return NextResponse.json({ delivery: updated, next_status: nextStatus });
}
