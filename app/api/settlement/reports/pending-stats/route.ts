import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isCeo, isDirector, isTeamLeader } from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const month = (new URL(req.url).searchParams.get("month") ?? monthNow()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식이 올바르지 않습니다." }, { status: 400 });

  const requester = auth.requester;
  const allAccess = isSuperAdmin(requester) || isDirector(requester) || isCeo(requester);
  const teamLeader = isTeamLeader(requester);
  if (!allAccess && !teamLeader) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  if (teamLeader && !allAccess) {
    const { count } = await supabaseAdmin
      .from("settlement_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_leader")
      .eq("team_name", requester.team_name ?? "")
      .is("deleted_at", null);
    return NextResponse.json({
      draft: 0,
      pending_leader: count ?? 0,
      pending_director: 0,
      carried_from_previous: 0,
      team_pending_leader: count ?? 0,
      scope: "team_leader",
    });
  }

  const countByStatus = (status: "draft" | "pending_leader" | "pending_director" | "carried_over") =>
    supabaseAdmin
      .from("settlement_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("ag_settlement_month", month)
      .eq("status", status)
      .is("deleted_at", null);
  const [{ count: draft }, { count: pendingLeader }, { count: pendingDirector }, { count: carried }] = await Promise.all([
    countByStatus("draft"),
    countByStatus("pending_leader"),
    countByStatus("pending_director"),
    countByStatus("carried_over"),
  ]);

  return NextResponse.json({
    draft: draft ?? 0,
    pending_leader: pendingLeader ?? 0,
    pending_director: pendingDirector ?? 0,
    carried_from_previous: carried ?? 0,
    team_pending_leader: 0,
    scope: "all",
  });
}
