import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function canCancelByRank(rank: string | null | undefined): boolean {
  return rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

async function getRequester(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,rank,approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from("users")
    .select("id,rank,approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (legacyErr) throw new Error(legacyErr.message);
  return legacy;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (!canCancelByRank(requester.rank)) {
      return NextResponse.json({ error: "본부장 이상만 취소할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });

    const { data: targetRow, error: targetErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id,user_id,status,used_amount,request_type")
      .eq("id", id)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!targetRow) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    if (targetRow.status === "cancelled") {
      return NextResponse.json({ ok: true, noop: true });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .neq("status", "cancelled")
      .select("id")
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    if (!updated) return NextResponse.json({ error: "이미 취소된 요청입니다." }, { status: 400 });

    const rt = String((targetRow as { request_type?: string | null }).request_type ?? "annual");
    const restoresAnnualBalance = rt === "annual" || rt === "half";

    if (targetRow.status === "approved" && restoresAnnualBalance) {
      const used = Number((targetRow as { used_amount?: number | null }).used_amount ?? 0);
      if (used > 0) {
        const { data: targetUser, error: targetUserErr } = await supabaseAdmin
          .from("users")
          .select("id,remaining_annual_leave")
          .eq("id", targetRow.user_id)
          .maybeSingle();
        if (targetUserErr) throw new Error(targetUserErr.message);
        if (targetUser) {
          const restored = Number(targetUser.remaining_annual_leave ?? 12) + used;
          const { error: restoreErr } = await supabaseAdmin
            .from("users")
            .update({ remaining_annual_leave: restored })
            .eq("id", targetRow.user_id);
          if (restoreErr) throw new Error(restoreErr.message);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "취소 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
