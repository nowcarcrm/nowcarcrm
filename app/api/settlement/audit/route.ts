import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isCeo, isDirector } from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester;
  if (!(isSuperAdmin(requester) || isDirector(requester) || isCeo(requester))) {
    return NextResponse.json({ error: "본부장 이상만 접근할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const entityType = (url.searchParams.get("entity_type") ?? "").trim();
  const entityId = (url.searchParams.get("entity_id") ?? "").trim();
  const action = (url.searchParams.get("action") ?? "").trim();
  const start = (url.searchParams.get("start") ?? "").trim();
  const end = (url.searchParams.get("end") ?? "").trim();
  const targetUserId = (url.searchParams.get("target_user_id") ?? "").trim();
  const performedBy = (url.searchParams.get("performed_by") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  let query = supabaseAdmin
    .from("settlement_audit_logs")
    .select("id,action,entity_type,entity_id,target_user_id,performed_by,details,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (action) query = query.eq("action", action);
  if (targetUserId) query = query.eq("target_user_id", targetUserId);
  if (performedBy) query = query.eq("performed_by", performedBy);
  if (start) query = query.gte("created_at", `${start}T00:00:00.000Z`);
  if (end) query = query.lte("created_at", `${end}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "감사 로그 조회 실패" }, { status: 500 });

  const performerIds = Array.from(new Set((data ?? []).map((r: any) => String(r.performed_by ?? "")).filter(Boolean)));
  const targetIds = Array.from(new Set((data ?? []).map((r: any) => String(r.target_user_id ?? "")).filter(Boolean)));
  const allIds = Array.from(new Set([...performerIds, ...targetIds]));
  const { data: users } = performerIds.length
    ? await supabaseAdmin.from("users").select("id,name").in("id", allIds)
    : { data: [] as any[] };
  const nameById = new Map((users ?? []).map((u: any) => [String(u.id), String(u.name ?? "")]));

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    performer_name: nameById.get(String(r.performed_by ?? "")) ?? "관리자",
    target_user_name: nameById.get(String(r.target_user_id ?? "")) ?? "",
  }));
  return NextResponse.json({ logs: rows, total: rows.length });
}
