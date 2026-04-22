import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const PatchSchema = z.object({
  base_rate: z.number().min(0).max(100),
  eligible_incentive: z.boolean(),
  incentive_per_tier_percent: z.number().min(0).max(100),
  include_sliding: z.boolean(),
  is_excluded: z.boolean(),
  special_note: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id?.trim()) return NextResponse.json({ error: "템플릿 ID가 필요합니다." }, { status: 400 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { data: before, error: beforeErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select(
      "id,user_id,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded,special_note,created_at,updated_at,updated_by"
    )
    .eq("id", id)
    .maybeSingle();
  if (beforeErr || !before) {
    return NextResponse.json({ error: "요율 템플릿을 찾을 수 없습니다." }, { status: 404 });
  }

  const next = parsed.data;
  const patch = {
    base_rate: next.is_excluded ? 0 : next.base_rate,
    eligible_incentive: next.eligible_incentive,
    incentive_per_tier_percent: next.incentive_per_tier_percent,
    include_sliding: next.include_sliding,
    is_excluded: next.is_excluded,
    special_note: next.special_note ?? null,
    updated_by: auth.requester.id,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .update(patch)
    .eq("id", id)
    .select(
      "id,user_id,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded,special_note,created_at,updated_at,updated_by"
    )
    .single();
  if (updateErr || !updated) {
    return NextResponse.json({ error: "요율 템플릿 수정에 실패했습니다." }, { status: 500 });
  }

  await logSettlementAudit({
    action: "rate_template_changed",
    entityType: "rate_template",
    entityId: updated.id,
    targetUserId: updated.user_id,
    performedBy: auth.requester.id,
    details: { before, after: updated },
  });

  return NextResponse.json({ row: updated });
}
