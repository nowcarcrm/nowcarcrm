/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const BodySchema = z.object({
  rate_month: z.string().regex(/^\d{4}-\d{2}$/),
  user_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const { rate_month, user_ids } = parsed.data;

  const { data: templates, error: tplErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("user_id,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded");
  if (tplErr) {
    return NextResponse.json({ error: "요율 템플릿 조회에 실패했습니다." }, { status: 500 });
  }

  const targetTemplates = (templates ?? []).filter((t) => !user_ids || user_ids.includes(String(t.user_id)));
  if (targetTemplates.length === 0) {
    return NextResponse.json({ applied: 0, skipped: [] });
  }

  const targetUserIds = targetTemplates.map((t) => String(t.user_id));

  const { data: confirmedRows, error: confirmedErr } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("user_id")
    .eq("rate_month", rate_month)
    .eq("status", "confirmed")
    .in("user_id", targetUserIds);
  if (confirmedErr) {
    return NextResponse.json({ error: "확정월 검사에 실패했습니다." }, { status: 500 });
  }
  const confirmedSet = new Set((confirmedRows ?? []).map((r) => String((r as { user_id: string }).user_id)));

  const applicable = targetTemplates.filter((t) => !confirmedSet.has(String(t.user_id)));
  const skippedIds = targetTemplates
    .map((t) => String(t.user_id))
    .filter((uid) => confirmedSet.has(uid));

  if (applicable.length > 0) {
    const upserts = applicable.map((t) => ({
      user_id: String(t.user_id),
      rate_month,
      base_rate: t.is_excluded ? 0 : t.base_rate,
      eligible_incentive: !!t.eligible_incentive,
      incentive_per_tier_percent: t.incentive_per_tier_percent ?? 5,
      include_sliding: !!t.include_sliding,
      is_excluded: !!t.is_excluded,
      created_by: auth.requester.id,
    }));
    const { error: upsertErr } = await supabaseAdmin
      .from("settlement_monthly_rates")
      .upsert(upserts, { onConflict: "user_id,rate_month" });
    if (upsertErr) {
      return NextResponse.json({ error: "월별 요율 적용에 실패했습니다." }, { status: 500 });
    }
  }

  const { data: userRows } = await supabaseAdmin
    .from("users")
    .select("id,name")
    .in("id", skippedIds.length > 0 ? skippedIds : ["00000000-0000-0000-0000-000000000000"]);
  const skippedNameById = new Map((userRows ?? []).map((u) => [String((u as any).id), String((u as any).name ?? "")]));

  const skipped = skippedIds.map((userId) => ({
    user_id: userId,
    user_name: skippedNameById.get(userId) ?? "직원",
    reason: "해당 월 정산이 이미 확정됨",
  }));

  await logSettlementAudit({
    action: "monthly_rate_applied",
    entityType: "monthly_rate",
    performedBy: auth.requester.id,
    details: {
      rate_month,
      applied_count: applicable.length,
      skipped_count: skipped.length,
      skipped_user_ids: skippedIds,
    },
  });

  return NextResponse.json({ applied: applicable.length, skipped });
}
