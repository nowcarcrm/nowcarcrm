import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function canDeleteByRank(rank: string | null | undefined): boolean {
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

export async function DELETE(
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
    if (!canDeleteByRank(requester.rank)) {
      return NextResponse.json({ error: "본부장 이상만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id,user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });

    const isOwner = String(row.user_id) === String(requester.id);
    const isCancelled = row.status === "cancelled";
    const adminDelete = canDeleteByRank(requester.rank);

    if (!(adminDelete || (isOwner && isCancelled))) {
      return NextResponse.json(
        { error: "취소된 본인 요청만 삭제할 수 있거나, 본부장 이상만 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    const { error: deleteErr } = await supabaseAdmin.from("leave_requests").delete().eq("id", id);
    if (deleteErr) throw new Error(deleteErr.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
