import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import {
  canAccessLeadDetail,
  canViewAllLeads,
  canViewLead,
} from "@/app/(admin)/_lib/rolePermissions";

type RequesterLike = {
  id: string;
  role: string;
  rank?: string | null;
  email?: string | null;
  team_name?: string | null;
};

/**보내기 허용 리드 id만 반환 (역할·팀 스코프) */
export async function filterLeadIdsForExport(
  requester: RequesterLike,
  leadIds: string[]
): Promise<string[]> {
  const uniq = [...new Set(leadIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, manager_user_id")
    .in("id", uniq);
  if (error || !leads?.length) return [];
  const managerIds = [
    ...new Set(
      (leads as { id: string; manager_user_id: string | null }[])
        .map((l) => l.manager_user_id)
        .filter((x): x is string => !!x && String(x).trim() !== "")
    ),
  ];
  let ownerById = new Map<
    string,
    { id: string; email: string | null; role: string | null; rank: string | null; team_name: string | null }
  >();
  if (managerIds.length) {
    const { data: owners } = await supabaseAdmin
      .from("users")
      .select("id, email, role, rank, team_name")
      .in("id", managerIds);
    ownerById = new Map(
      (owners ?? []).map((o) => [
        String((o as { id: string }).id),
        {
          id: String((o as { id: string }).id),
          email: (o as { email?: string | null }).email ?? null,
          role: (o as { role?: string | null }).role ?? null,
          rank: (o as { rank?: string | null }).rank ?? null,
          team_name: (o as { team_name?: string | null }).team_name ?? null,
        },
      ])
    );
  }
  const viewer: RequesterLike = requester;
  const out: string[] = [];
  for (const row of leads as { id: string; manager_user_id: string | null }[]) {
    const lid = String(row.id);
    const mid = row.manager_user_id ? String(row.manager_user_id).trim() : "";
    if (!mid) continue;
    const owner =
      ownerById.get(mid) ??
      ({ id: mid, email: null, role: null, rank: null, team_name: null } as const);
    if (canViewAllLeads(viewer)) {
      out.push(lid);
      continue;
    }
    if (canAccessLeadDetail(viewer, viewer.id, mid)) {
      out.push(lid);
      continue;
    }
    if (canViewLead(viewer, owner)) {
      out.push(lid);
      continue;
    }
  }
  return out;
}
