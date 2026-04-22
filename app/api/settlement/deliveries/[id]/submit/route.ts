import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { canSubmit, resolveSubmitStatus } from "@/app/(admin)/_lib/settlement/permissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { findDirectorId, findTeamLeaderId } from "@/app/(admin)/_lib/settlement/approvalHelpers";
import { notifyDeliverySubmitted } from "@/app/(admin)/_lib/settlement/notifications";
import { SUPER_ADMIN_EMAIL } from "@/app/(admin)/_lib/rolePermissions";
import type { Delivery } from "@/app/(admin)/_types/settlement";

const BodySchema = z.object({
  version: z.number().int().min(1),
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
  if (!canSubmit(auth.requester, delivery)) return NextResponse.json({ error: "제출 권한이 없습니다." }, { status: 403 });
  if (delivery.version !== parsed.data.version) {
    return NextResponse.json({ error: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요." }, { status: 409 });
  }

  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("id,name,rank,team_name,role,email")
    .eq("id", delivery.owner_id)
    .maybeSingle();
  if (!owner) return NextResponse.json({ error: "담당자 정보를 찾을 수 없습니다." }, { status: 400 });
  const nextStatus = resolveSubmitStatus(owner as any);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("settlement_deliveries")
    .update({ status: nextStatus, version: delivery.version + 1, updated_at: new Date().toISOString() })
    .eq("id", delivery.id)
    .eq("version", delivery.version)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) {
    return NextResponse.json({ error: "상태 변경에 실패했습니다." }, { status: 409 });
  }

  await supabaseAdmin.from("settlement_approvals").insert({
    delivery_id: delivery.id,
    approver_id: auth.requester.id,
    approval_level: "submitter",
    action: "submit",
    notes: null,
  });

  await logSettlementAudit({
    action: "delivery_submitted",
    entityType: "delivery",
    entityId: delivery.id,
    targetUserId: delivery.owner_id,
    performedBy: auth.requester.id,
    details: { from_status: delivery.status, to_status: nextStatus, owner_rank: (owner as any).rank ?? null },
  });

  let notificationSentTo: string | null = null;
  const ownerName = String((owner as any).name ?? "직원");
  const customerName = delivery.customer_name;
  try {
    if (nextStatus === "pending_leader") {
      const leaderId = await findTeamLeaderId(delivery.team_name);
      const directorId = await findDirectorId();
      const recipientId = leaderId ?? directorId;
      if (recipientId) {
        notificationSentTo = recipientId;
        await notifyDeliverySubmitted(delivery.id, customerName, ownerName, recipientId, leaderId ? "leader" : "director");
      }
    } else if (nextStatus === "pending_director") {
      const directorId = await findDirectorId();
      if (directorId) {
        notificationSentTo = directorId;
        await notifyDeliverySubmitted(delivery.id, customerName, ownerName, directorId, "director");
      }
    } else if (nextStatus === "approved_director") {
      const { data: superAdmin } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(`email.eq.${SUPER_ADMIN_EMAIL},role.eq.super_admin`)
        .limit(1)
        .maybeSingle();
      if (superAdmin?.id) {
        notificationSentTo = superAdmin.id;
        await notifyDeliverySubmitted(delivery.id, customerName, ownerName, superAdmin.id, "director");
      }
    }
  } catch {
    // 알림 실패는 상태 전이를 막지 않음
  }

  return NextResponse.json({ delivery: updated, next_status: nextStatus, notification_sent_to: notificationSentTo });
}
