import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const PatchSchema = z.object({
  payment_date: z.string().trim().optional(),
  source: z.string().trim().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  target_user_id: z.string().uuid().optional(),
  target_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  notes: z.string().trim().optional().nullable(),
  delivery_id: z.string().uuid().optional().nullable(),
});

async function fetchRow(id: string) {
  const { data } = await supabaseAdmin
    .from("settlement_prepayments")
    .select("id,applied,target_user_id,amount,target_month")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; applied: boolean; target_user_id: string; amount: number; target_month: string } | null;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const { id } = await context.params;
  const row = await fetchRow(id);
  if (!row) return NextResponse.json({ error: "대상을 찾을 수 없습니다." }, { status: 404 });
  if (row.applied) return NextResponse.json({ error: "반영 완료된 선지급은 수정할 수 없습니다." }, { status: 400 });

  const patch = { ...parsed.data } as Record<string, unknown>;
  if (patch.amount !== undefined) patch.amount = Math.round(Number(patch.amount));
  const { data, error } = await supabaseAdmin.from("settlement_prepayments").update(patch).eq("id", id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "수정 실패" }, { status: 500 });

  await logSettlementAudit({
    action: "prepayment_updated",
    entityType: "prepayment",
    entityId: id,
    targetUserId: String((data as any).target_user_id ?? row.target_user_id),
    performedBy: auth.requester.id,
    details: { after: data },
  });
  return NextResponse.json({ prepayment: data });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const { id } = await context.params;
  const row = await fetchRow(id);
  if (!row) return NextResponse.json({ success: true });
  if (row.applied) return NextResponse.json({ error: "반영 완료된 선지급은 삭제할 수 없습니다." }, { status: 400 });

  const { error } = await supabaseAdmin.from("settlement_prepayments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  await logSettlementAudit({
    action: "prepayment_deleted",
    entityType: "prepayment",
    entityId: id,
    targetUserId: row.target_user_id,
    performedBy: auth.requester.id,
    details: { amount: row.amount, target_month: row.target_month },
  });
  return NextResponse.json({ success: true });
}
