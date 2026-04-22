/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

function rankOrder(rank: string | null | undefined) {
  const r = (rank ?? "").trim();
  switch (r) {
    case "총괄대표":
      return 1;
    case "대표":
      return 2;
    case "본부장":
      return 3;
    case "팀장":
      return 4;
    case "차장":
      return 5;
    case "과장":
      return 6;
    case "대리":
      return 7;
    case "주임":
      return 8;
    default:
      return 99;
  }
}

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id,name,email,rank,team_name,is_active,approval_status")
    .eq("is_active", true)
    .eq("approval_status", "approved");
  if (error) return NextResponse.json({ error: "직원 조회 실패" }, { status: 500 });

  const { data: templRows, error: tErr } = await supabaseAdmin.from("settlement_rate_templates").select("user_id");
  if (tErr) return NextResponse.json({ error: "요율 템플릿 조회 실패" }, { status: 500 });
  const hasTemplate = new Set((templRows ?? []).map((r) => String((r as any).user_id)));

  const rows = (users ?? [])
    .filter((u) => !hasTemplate.has(String((u as any).id)))
    .map((u) => ({
      id: String((u as any).id),
      name: String((u as any).name ?? ""),
      email: String((u as any).email ?? ""),
      rank: String((u as any).rank ?? ""),
      team_name: (u as any).team_name == null ? null : String((u as any).team_name),
    }))
    .sort((a, b) => {
      const diff = rankOrder(a.rank) - rankOrder(b.rank);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "ko");
    });

  return NextResponse.json({ rows });
}
