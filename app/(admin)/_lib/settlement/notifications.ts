import { emitToUserRoom } from "@/app/_lib/socketGateway";
import { REALTIME_EVENTS } from "@/app/_lib/realtimeEvents";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

type NotificationInput = {
  user_id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

export async function sendSettlementNotification(input: NotificationInput) {
  try {
    const { data: inserted, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data ?? {},
      })
      .select("id,user_id,type,title,message,data,is_read,created_at")
      .single();
    if (error) {
      console.error("[NOTIF FAIL]", error, input);
      return;
    }
    emitToUserRoom(input.user_id, REALTIME_EVENTS.NOTIFICATION, inserted);
  } catch (e) {
    console.error("[NOTIF ERROR]", e, input);
  }
}

export async function notifyDeliverySubmitted(
  deliveryId: string,
  customerName: string,
  ownerName: string,
  recipientUserId: string,
  level: "leader" | "director"
) {
  await sendSettlementNotification({
    user_id: recipientUserId,
    type: level === "leader" ? "settlement_delivery_pending_leader" : "settlement_delivery_pending_director",
    title: `승인 대기: ${customerName} 출고건`,
    message: `${ownerName}님의 출고건이 ${level === "leader" ? "팀장" : "본부장"} 승인을 기다리고 있습니다.`,
    data: { delivery_id: deliveryId, action: "approve" },
  });
}

export async function notifyDeliveryApproved(
  deliveryId: string,
  customerName: string,
  recipientUserId: string,
  approverName: string,
  nextStatus: string
) {
  await sendSettlementNotification({
    user_id: recipientUserId,
    type: "settlement_delivery_approved",
    title: `승인됨: ${customerName} 출고건`,
    message: `${approverName}님이 승인했습니다. 현재 상태: ${nextStatus}`,
    data: { delivery_id: deliveryId },
  });
}

export async function notifyDeliveryRejected(
  deliveryId: string,
  customerName: string,
  recipientUserId: string,
  rejectorName: string,
  reason: string
) {
  await sendSettlementNotification({
    user_id: recipientUserId,
    type: "settlement_delivery_rejected",
    title: `반려됨: ${customerName} 출고건`,
    message: `${rejectorName}님이 반려했습니다.\n사유: ${reason}`,
    data: { delivery_id: deliveryId, reason },
  });
}

export async function notifyDeliveryReopened(
  deliveryId: string,
  customerName: string,
  recipientUserId: string,
  reopenerName: string,
  reason: string
) {
  await sendSettlementNotification({
    user_id: recipientUserId,
    type: "settlement_delivery_reopened",
    title: `재오픈됨: ${customerName} 출고건`,
    message: `${reopenerName}님이 재오픈했습니다.\n사유: ${reason}`,
    data: { delivery_id: deliveryId, reason },
  });
}
