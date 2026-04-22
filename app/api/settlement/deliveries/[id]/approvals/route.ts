/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { canReadDelivery } from "@/app/api/settlement/deliveries/_lib";
import type { Delivery } from "@/app/(admin)/_types/settlement";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;

  const { data: deliveryRaw } = await supabaseAdmin.from("settlement_deliveries").select("*").eq("id", id).maybeSingle();
  const delivery = deliveryRaw as Delivery | null;
  if (!delivery) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });
  if (!canReadDelivery(auth.requester as any, delivery)) return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("settlement_approvals")
    .select("id,delivery_id,approver_id,approval_level,action,notes,created_at")
    .eq("delivery_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "승인 이력 조회 실패" }, { status: 500 });

  const approverIds = Array.from(new Set((data ?? []).map((r: any) => String(r.approver_id ?? "")).filter(Boolean)));
  const { data: users } = approverIds.length
    ? await supabaseAdmin.from("users").select("id,name,rank").in("id", approverIds)
    : { data: [] as any[] };
  const userById = new Map((users ?? []).map((u: any) => [String(u.id), u]));

  const rows = (data ?? []).map((r: any) => {
    const user = userById.get(String(r.approver_id ?? ""));
    return {
      ...r,
      approver_name: String((user as any)?.name ?? "관리자"),
      approver_rank: String((user as any)?.rank ?? ""),
    };
  });

  return NextResponse.json({ rows });
}
