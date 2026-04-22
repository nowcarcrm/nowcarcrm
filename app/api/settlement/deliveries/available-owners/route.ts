import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import type { Requester } from "../_lib";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id,name,email,team_name,rank,is_active,approval_status")
    .eq("is_active", true)
    .eq("approval_status", "approved");
  if (error) return NextResponse.json({ error: "직원 조회 실패" }, { status: 500 });

  const { data: templates, error: tErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("user_id");
  if (tErr) return NextResponse.json({ error: "요율 템플릿 조회 실패" }, { status: 500 });
  const templateUserSet = new Set((templates ?? []).map((t) => String((t as any).user_id)));

  const scoped = (users ?? []).filter((u) => templateUserSet.has(String((u as any).id)));
  const scope = getDeliveryScope(requester);
  const rows = scoped
    .filter((u) => {
      const uid = String((u as any).id);
      const teamName = (u as any).team_name == null ? null : String((u as any).team_name);
      if (scope.scope === "all") return true;
      if (scope.scope === "team") return uid === requester.id || teamName === scope.team_name;
      return uid === scope.user_id;
    })
    .map((u) => ({
      id: String((u as any).id),
      name: String((u as any).name ?? ""),
      email: String((u as any).email ?? ""),
      team_name: (u as any).team_name == null ? null : String((u as any).team_name),
      rank: String((u as any).rank ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return NextResponse.json({ owners: rows });
}
