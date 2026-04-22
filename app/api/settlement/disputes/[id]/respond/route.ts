/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { notifyDisputeResolved } from "@/app/(admin)/_lib/settlement/notifications";

const BodySchema = z.object({
  response: z.string().trim().min(1).max(1000),
  status: z.enum(["resolved", "rejected"]),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const { id } = await context.params;

  const { data: dispute } = await supabaseAdmin
    .from("settlement_disputes")
    .select("id,report_id,submitted_by,status")
    .eq("id", id)
    .maybeSingle();
  if (!dispute) return NextResponse.json({ error: "이의 제기를 찾을 수 없습니다." }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("settlement_disputes")
    .update({
      response: parsed.data.response,
      status: parsed.data.status,
      resolved_at: new Date().toISOString(),
      resolved_by: auth.requester.id,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "답변 처리 실패" }, { status: 500 });

  await notifyDisputeResolved(id, parsed.data.status, String((dispute as any).submitted_by));
  await logSettlementAudit({
    action: "dispute_responded",
    entityType: "dispute",
    entityId: id,
    targetUserId: String((dispute as any).submitted_by),
    performedBy: auth.requester.id,
    details: { status: parsed.data.status, report_id: String((dispute as any).report_id) },
  });

  return NextResponse.json({ dispute: data });
}
