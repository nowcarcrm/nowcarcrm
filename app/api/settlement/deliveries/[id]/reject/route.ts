import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { canReject } from "@/app/(admin)/_lib/settlement/permissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { notifyDeliveryRejected } from "@/app/(admin)/_lib/settlement/notifications";
import type { Delivery } from "@/app/(admin)/_types/settlement";

const BodySchema = z.object({
  version: z.number().int().min(1),
  reason: z.string().trim().min(1, "반려 사유를 입력하세요.").max(500, "반려 사유는 500자 이내여야 합니다."),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const { id } = await context.params;

  const { data: deliveryRaw } = await supabaseAdmin.from("settlement_deliveries").select("*").eq("id", id).maybeSingle();
  const delivery = deliveryRaw as Delivery | null;
  if (!delivery) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });
  if (!canReject(auth.requester, delivery)) return NextResponse.json({ error: "반려 권한이 없습니다." }, { status: 403 });
  if (delivery.version !== parsed.data.version) {
    return NextResponse.json({ error: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요." }, { status: 409 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("settlement_deliveries")
    .update({ status: "draft", version: delivery.version + 1, updated_at: new Date().toISOString() })
    .eq("id", delivery.id)
    .eq("version", delivery.version)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) return NextResponse.json({ error: "상태 변경에 실패했습니다." }, { status: 409 });

  const level = delivery.status === "pending_leader" ? "team_leader" : "director";
  await supabaseAdmin.from("settlement_approvals").insert({
    delivery_id: delivery.id,
    approver_id: auth.requester.id,
    approval_level: level,
    action: "reject",
    notes: parsed.data.reason,
  });

  await logSettlementAudit({
    action: "delivery_rejected",
    entityType: "delivery",
    entityId: delivery.id,
    targetUserId: delivery.owner_id,
    performedBy: auth.requester.id,
    details: { from_status: delivery.status, to_status: "draft", reason: parsed.data.reason },
  });

  try {
    await notifyDeliveryRejected(
      delivery.id,
      delivery.customer_name,
      delivery.owner_id,
      String(auth.requester.name ?? "승인자"),
      parsed.data.reason
    );
  } catch {
    // 알림 실패 무시
  }

  return NextResponse.json({ delivery: updated, reason: parsed.data.reason });
}
