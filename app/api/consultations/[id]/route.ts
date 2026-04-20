import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import {
  canAccessLeadDetail,
  canViewAllLeads,
  canViewLead,
  isSuperAdmin,
} from "@/app/(admin)/_lib/rolePermissions";
import type { CounselingRecord } from "@/app/(admin)/_lib/leaseCrmTypes";
import { serializeConsultationToMemo } from "@/app/(admin)/_lib/leaseCrmSupabase";

const LEAD_EXTRA_MEMO_PREFIX = "CRM_EXTRA:v1:";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getRequester(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,role,rank,team_name,approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from("users")
    .select("id,email,role,rank,team_name,approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (legacyErr) throw new Error(legacyErr.message);
  return legacy;
}

function canMutateConsultation(
  requester: { id: string; email: string | null; role: string | null; rank: string | null; team_name: string | null },
  leadManagerId: string | null,
  leadOwnerRow: { id: string; team_name: string | null; rank: string | null; role: string | null; email: string | null } | null
): boolean {
  const v = {
    id: requester.id,
    email: requester.email,
    role: requester.role,
    rank: requester.rank,
    team_name: requester.team_name,
  };
  if (isSuperAdmin(v)) return true;
  if (canViewAllLeads(v)) return true;
  if (canAccessLeadDetail(v, requester.id, leadManagerId)) return true;
  if (leadOwnerRow && canViewLead(v, leadOwnerRow)) return true;
  return false;
}

async function loadLeadManagerRow(managerId: string | null) {
  const mid = (managerId ?? "").trim();
  if (!mid) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,email,role,rank,team_name")
    .eq("id", mid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as {
    id: string;
    email: string | null;
    role: string | null;
    rank: string | null;
    team_name: string | null;
  }) ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }
    const requester = await getRequester(authData.user.id);
    if (!requester || requester.approval_status !== "approved") {
      return NextResponse.json({ error: "승인된 사용자만 처리할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    const cid = (id ?? "").trim();
    if (!cid) return NextResponse.json({ error: "상담기록 ID가 필요합니다." }, { status: 400 });

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("consultations")
      .select("id,lead_id,memo,counselor,method,importance,reaction,desired_progress_at,next_action_at,next_contact_memo,created_at")
      .eq("id", cid)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) return NextResponse.json({ error: "상담기록을 찾을 수 없습니다." }, { status: 404 });
    const memoGuard = String((row as { memo?: string | null }).memo ?? "");
    if (memoGuard.startsWith(LEAD_EXTRA_MEMO_PREFIX)) {
      return NextResponse.json({ error: "시스템 확장 행은 수정할 수 없습니다." }, { status: 400 });
    }

    const leadId = String((row as { lead_id: string }).lead_id ?? "");
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id,manager_user_id")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });

    const managerId = ((lead as { manager_user_id?: string | null }).manager_user_id ?? null) as string | null;
    const ownerRow = await loadLeadManagerRow(managerId);
    const reqLike = {
      id: String(requester.id),
      email: (requester.email as string | null) ?? null,
      role: (requester.role as string | null) ?? null,
      rank: (requester.rank as string | null) ?? null,
      team_name: (requester.team_name as string | null) ?? null,
    };
    if (!canMutateConsultation(reqLike, managerId, ownerRow)) {
      return NextResponse.json({ error: "이 상담기록을 수정할 권한이 없습니다." }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const occurredRaw =
      (typeof body.occurredAt === "string" && body.occurredAt) ||
      (typeof body.created_at === "string" && body.created_at) ||
      "";
    if (!occurredRaw.trim()) {
      return NextResponse.json({ error: "상담일시(occurredAt)가 필요합니다." }, { status: 400 });
    }
    const content =
      (typeof body.content === "string" && body.content) || (typeof body.memo === "string" && body.memo) || "";
    if (!String(content).trim()) {
      return NextResponse.json({ error: "상담 내용이 필요합니다." }, { status: 400 });
    }

    const rec: CounselingRecord = {
      id: cid,
      occurredAt: new Date(occurredRaw).toISOString(),
      counselor: typeof body.counselor === "string" ? body.counselor.trim() : "",
      method: (typeof body.method === "string" ? body.method : "전화") as CounselingRecord["method"],
      content: String(content).trim(),
      reaction: typeof body.reaction === "string" ? body.reaction.trim() : "",
      desiredProgressAt:
        typeof body.desiredProgressAt === "string" && body.desiredProgressAt.trim()
          ? new Date(body.desiredProgressAt).toISOString()
          : new Date(occurredRaw).toISOString(),
      nextContactAt:
        typeof body.nextContactAt === "string" && body.nextContactAt.trim()
          ? new Date(body.nextContactAt).toISOString()
          : new Date(occurredRaw).toISOString(),
      nextContactMemo: typeof body.nextContactMemo === "string" ? body.nextContactMemo.trim() : "",
      importance: (typeof body.importance === "string" ? body.importance : "보통") as CounselingRecord["importance"],
    };

    const memo = serializeConsultationToMemo(rec);
    const patch = {
      memo,
      counselor: rec.counselor,
      method: rec.method,
      importance: rec.importance,
      reaction: rec.reaction,
      desired_progress_at: rec.desiredProgressAt,
      next_action_at: rec.nextContactAt,
      next_contact_memo: rec.nextContactMemo || null,
      created_at: rec.occurredAt,
    };

    const { error: updErr } = await supabaseAdmin.from("consultations").update(patch).eq("id", cid);
    if (updErr) throw new Error(updErr.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "상담기록 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }
    const requester = await getRequester(authData.user.id);
    if (!requester || requester.approval_status !== "approved") {
      return NextResponse.json({ error: "승인된 사용자만 처리할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    const cid = (id ?? "").trim();
    if (!cid) return NextResponse.json({ error: "상담기록 ID가 필요합니다." }, { status: 400 });

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("consultations")
      .select("id,lead_id,memo")
      .eq("id", cid)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) return NextResponse.json({ error: "상담기록을 찾을 수 없습니다." }, { status: 404 });
    const memoDel = String((row as { memo?: string | null }).memo ?? "");
    if (memoDel.startsWith(LEAD_EXTRA_MEMO_PREFIX)) {
      return NextResponse.json({ error: "시스템 확장 행은 삭제할 수 없습니다." }, { status: 400 });
    }

    const leadId = String((row as { lead_id: string }).lead_id ?? "");
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id,manager_user_id")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });

    const managerId = ((lead as { manager_user_id?: string | null }).manager_user_id ?? null) as string | null;
    const ownerRow = await loadLeadManagerRow(managerId);
    const reqLike = {
      id: String(requester.id),
      email: (requester.email as string | null) ?? null,
      role: (requester.role as string | null) ?? null,
      rank: (requester.rank as string | null) ?? null,
      team_name: (requester.team_name as string | null) ?? null,
    };
    if (!canMutateConsultation(reqLike, managerId, ownerRow)) {
      return NextResponse.json({ error: "이 상담기록을 삭제할 권한이 없습니다." }, { status: 403 });
    }

    const { error: delErr } = await supabaseAdmin.from("consultations").delete().eq("id", cid);
    if (delErr) throw new Error(delErr.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "상담기록 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
