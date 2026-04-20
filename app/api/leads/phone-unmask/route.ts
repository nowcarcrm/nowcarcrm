import { NextResponse } from "next/server";
import {
  canAccessLeadDetail,
  canViewAllLeads,
  canViewLead,
} from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getClientIpFromHeaders } from "@/app/_lib/requestClientMeta";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

type Body = { leadId: string };

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const leadId = (body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "leadId 필요" }, { status: 400 });
  }

  const { data: lead, error: lErr } = await supabaseAdmin
    .from("leads")
    .select("id, manager_user_id")
    .eq("id", leadId)
    .maybeSingle();
  if (lErr || !lead) {
    return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  }
  const mid = (lead as { manager_user_id?: string | null }).manager_user_id
    ? String((lead as { manager_user_id: string }).manager_user_id).trim()
    : "";
  if (!mid) {
    return NextResponse.json({ error: "담당자 정보 없음" }, { status: 400 });
  }
  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("id, email, role, rank, team_name")
    .eq("id", mid)
    .maybeSingle();
  const ownerRow = owner as {
    id: string;
    email: string | null;
    role: string | null;
    rank: string | null;
    team_name: string | null;
  } | null;
  const viewer = {
    id: auth.requester.id,
    role: auth.requester.role,
    rank: auth.requester.rank ?? null,
    email: auth.requester.email ?? null,
    team_name: auth.requester.team_name ?? null,
  };
  const canSee =
    canViewAllLeads(viewer) ||
    canAccessLeadDetail(viewer, viewer.id, mid) ||
    (ownerRow ? canViewLead(viewer, ownerRow) : false);
  if (!canSee) {
    return NextResponse.json({ error: "열람 권한이 없습니다." }, { status: 403 });
  }

  const ip = getClientIpFromHeaders(req.headers);
  await supabaseAdmin.from("access_logs").insert({
    user_id: auth.requester.id,
    accessed_resource: "phone_unmask",
    resource_id: leadId,
    action_type: "phone_unmask_confirm",
    ip_address: ip,
  });

  return NextResponse.json({ ok: true });
}
