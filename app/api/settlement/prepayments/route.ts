/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

const PostSchema = z.object({
  payment_date: z.string().trim().min(1),
  source: z.string().trim().min(1).max(100),
  amount: z.number().positive(),
  target_user_id: z.string().uuid(),
  target_month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().trim().optional().nullable(),
  delivery_id: z.string().uuid().optional().nullable(),
});

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const url = new URL(req.url);
  const month = (url.searchParams.get("month") ?? "").trim();
  const includeApplied = (url.searchParams.get("include_applied") ?? "false").trim() === "true";

  let query = supabaseAdmin
    .from("settlement_prepayments")
    .select("id,payment_date,source,amount,target_user_id,target_month,delivery_id,notes,applied,applied_at,created_at,created_by")
    .order("payment_date", { ascending: false })
    .limit(500);
  if (month) query = query.eq("target_month", month);
  if (!includeApplied) query = query.eq("applied", false);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "선지급 조회 실패" }, { status: 500 });

  const userIds = Array.from(new Set((data ?? []).map((r: any) => String(r.target_user_id ?? "")).filter(Boolean)));
  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id,name,rank,team_name").in("id", userIds)
    : { data: [] as any[] };
  const userById = new Map((users ?? []).map((u: any) => [String(u.id), u]));

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    target_user_name: String(userById.get(String(r.target_user_id))?.name ?? "(알수없음)"),
    target_user_rank: String(userById.get(String(r.target_user_id))?.rank ?? ""),
    target_user_team_name: userById.get(String(r.target_user_id))?.team_name ?? null,
  }));
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = PostSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: tpl } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("id")
    .eq("user_id", parsed.data.target_user_id)
    .maybeSingle();
  if (!tpl) return NextResponse.json({ error: "정산 대상 직원이 아닙니다." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("settlement_prepayments")
    .insert({
      payment_date: parsed.data.payment_date,
      source: parsed.data.source,
      amount: Math.round(parsed.data.amount),
      target_user_id: parsed.data.target_user_id,
      target_month: parsed.data.target_month,
      delivery_id: parsed.data.delivery_id ?? null,
      notes: parsed.data.notes?.trim() || null,
      applied: false,
      created_by: auth.requester.id,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "선지급 등록 실패" }, { status: 500 });

  await logSettlementAudit({
    action: "prepayment_created",
    entityType: "prepayment",
    entityId: String((data as any).id),
    targetUserId: parsed.data.target_user_id,
    performedBy: auth.requester.id,
    details: { amount: Math.round(parsed.data.amount), target_month: parsed.data.target_month },
  });
  return NextResponse.json({ prepayment: data });
}
