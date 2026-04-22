import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester;

  const url = new URL(req.url);
  const entityType = (url.searchParams.get("entity_type") ?? "").trim();
  const entityId = (url.searchParams.get("entity_id") ?? "").trim();

  let query = supabaseAdmin
    .from("settlement_audit_logs")
    .select("id,action,entity_type,entity_id,target_user_id,performed_by,details,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "감사 로그 조회 실패" }, { status: 500 });

  const performerIds = Array.from(new Set((data ?? []).map((r: any) => String(r.performed_by ?? "")).filter(Boolean)));
  const { data: users } = performerIds.length
    ? await supabaseAdmin.from("users").select("id,name").in("id", performerIds)
    : { data: [] as any[] };
  const nameById = new Map((users ?? []).map((u: any) => [String(u.id), String(u.name ?? "")]));

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    performer_name: nameById.get(String(r.performed_by ?? "")) ?? "관리자",
  }));
  return NextResponse.json({ rows });
}
