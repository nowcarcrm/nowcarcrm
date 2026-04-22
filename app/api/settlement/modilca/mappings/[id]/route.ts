import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(_req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.requester)) return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  const { id } = await context.params;

  const { data: before } = await supabaseAdmin
    .from("settlement_modilca_column_mappings")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ success: true });

  const { error } = await supabaseAdmin.from("settlement_modilca_column_mappings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "매핑 삭제 실패" }, { status: 500 });

  await logSettlementAudit({
    action: "modilca_mapping_deleted",
    entityType: "modilca_mapping",
    entityId: id,
    performedBy: auth.requester.id,
    details: { name: before.name },
  });
  return NextResponse.json({ success: true });
}
