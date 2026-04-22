import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.requester)) return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
  const includeMappings = (url.searchParams.get("include_mappings") ?? "false") === "true";

  let query = supabaseAdmin
    .from("settlement_modilca_uploads")
    .select("id,file_name,uploaded_by,uploaded_at,matched_count,unmatched_count,status")
    .order("uploaded_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "업로드 이력 조회 실패" }, { status: 500 });

  let countQuery = supabaseAdmin.from("settlement_modilca_uploads").select("id", { count: "exact", head: true });
  if (status) countQuery = countQuery.eq("status", status);
  const { count } = await countQuery;

  const userIds = Array.from(new Set((data ?? []).map((u) => String((u as { uploaded_by?: string }).uploaded_by ?? "")).filter(Boolean)));
  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id,name").in("id", userIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map((users ?? []).map((u) => [String(u.id), String(u.name ?? "")]));
  const uploads = (data ?? []).map((u) => ({
    ...u,
    uploaded_by_name: nameById.get(String((u as { uploaded_by?: string }).uploaded_by ?? "")) ?? "",
  }));

  if (!includeMappings) return NextResponse.json({ uploads, total: count ?? uploads.length });

  const { data: mappings } = await supabaseAdmin
    .from("settlement_modilca_column_mappings")
    .select("id,name,mapping_json,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ uploads, total: count ?? uploads.length, mappings: mappings ?? [] });
}
