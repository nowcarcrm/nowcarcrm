import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function logSettlementAudit({
  action,
  entityType,
  entityId,
  targetUserId,
  performedBy,
  details,
}: {
  action: string;
  entityType: string;
  entityId?: string;
  targetUserId?: string;
  performedBy: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("settlement_audit_logs").insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    target_user_id: targetUserId,
    performed_by: performedBy,
    details: details ?? {},
  });

  if (error) {
    console.error("[AUDIT LOG FAIL]", error, { action, entityType });
    // 감사 로그 실패는 메인 작업을 막지 않음
  }
}
