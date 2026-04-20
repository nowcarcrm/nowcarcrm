import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

/** 총괄대표 전용: 필터용 직원 목록 */
export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, rank, role")
    .or("approval_status.eq.approved,approval_status.is.null")
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}
