import { NextResponse } from "next/server";
import { canViewAllLeads, isTeamLeader, normalizeUserTeam } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

type SidebarCountKey =
  | "new"
  | "counseling"
  | "unresponsive"
  | "contract"
  | "delivered"
  | "hold"
  | "cancel";

type SidebarCounts = Record<SidebarCountKey, number>;

const EMPTY_COUNTS: SidebarCounts = {
  new: 0,
  counseling: 0,
  unresponsive: 0,
  contract: 0,
  delivered: 0,
  hold: 0,
  cancel: 0,
};

function toCountKey(status: string): SidebarCountKey | null {
  const s = status.trim();
  if (s === "신규") return "new";
  if (s === "상담중") return "counseling";
  if (s === "부재") return "unresponsive";
  if (s === "계약완료" || s === "확정" || s === "출고") return "contract";
  if (s === "인도완료") return "delivered";
  if (s === "보류") return "hold";
  if (s === "취소") return "cancel";
  return null;
}

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const viewer = {
    id: auth.requester.id,
    role: auth.requester.role,
    rank: auth.requester.rank,
    email: auth.requester.email,
    team_name: auth.requester.team_name,
  };

  let query = supabaseAdmin
    .from("leads")
    .select("status, count:count()")
    .not("deleted_at", "is", null);

  if (canViewAllLeads(viewer)) {
    query = supabaseAdmin.from("leads").select("status, count:count()").is("deleted_at", null);
  } else if (isTeamLeader(viewer)) {
    const teamName = normalizeUserTeam(viewer.team_name);
    if (!teamName) {
      query = supabaseAdmin
        .from("leads")
        .select("status, count:count()")
        .is("deleted_at", null)
        .eq("manager_user_id", viewer.id);
    } else {
      const { data: users, error: usersErr } = await supabaseAdmin
        .from("users")
        .select("id,rank,team_name,approval_status")
        .eq("team_name", teamName)
        .or("approval_status.eq.approved,approval_status.is.null");
      if (usersErr) {
        return NextResponse.json({ error: "팀 사용자 조회 실패" }, { status: 500 });
      }
      const visibleIds = (users ?? [])
        .filter((u) => {
          const rank = String((u as { rank?: string | null }).rank ?? "").trim();
          return rank !== "대표" && rank !== "총괄대표";
        })
        .map((u) => String((u as { id?: string | null }).id ?? "").trim())
        .filter(Boolean);
      if (visibleIds.length === 0) {
        return NextResponse.json(EMPTY_COUNTS);
      }
      query = supabaseAdmin
        .from("leads")
        .select("status, count:count()")
        .is("deleted_at", null)
        .in("manager_user_id", visibleIds);
    }
  } else {
    query = supabaseAdmin
      .from("leads")
      .select("status, count:count()")
      .is("deleted_at", null)
      .eq("manager_user_id", viewer.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "카운트 조회 실패" }, { status: 500 });
  }

  const counts: SidebarCounts = { ...EMPTY_COUNTS };
  for (const row of (data ?? []) as Array<{ status?: string | null; count?: number | string | null }>) {
    const key = toCountKey(String(row.status ?? ""));
    if (!key) continue;
    const n = Number(row.count ?? 0);
    if (Number.isFinite(n)) {
      counts[key] += n;
    }
  }

  return NextResponse.json(counts);
}
