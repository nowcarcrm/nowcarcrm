import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(_req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.requester)) return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from("settlement_modilca_uploads")
    .select("id,file_name,uploaded_by,uploaded_at,parsed_rows,matched_count,unmatched_count,status,notes")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "상세 조회 실패" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "업로드 이력을 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ upload: data });
}
