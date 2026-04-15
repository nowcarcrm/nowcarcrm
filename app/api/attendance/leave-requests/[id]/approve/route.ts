import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function canApproveByRank(rank: string | null | undefined): boolean {
  return rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

const ANNUAL_LEAVE_QUOTA = 12;

function thisYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
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
    if (!canApproveByRank(requester.rank)) {
      return NextResponse.json({ error: "본부장 이상만 연차요청을 승인할 수 있습니다." }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });

    const { data: targetRow, error: targetErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id,user_id,used_amount,from_date,status")
      .eq("id", id)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!targetRow || targetRow.status !== "pending") {
      return NextResponse.json({ error: "대기 상태 요청만 승인할 수 있습니다." }, { status: 400 });
    }

    const { start, end } = thisYearRange();
    const { data: usedRows, error: usedErr } = await supabaseAdmin
      .from("leave_requests")
      .select("used_amount")
      .eq("user_id", targetRow.user_id)
      .eq("status", "approved")
      .gte("from_date", start)
      .lte("from_date", end);
    if (usedErr) throw new Error(usedErr.message);
    const approvedUsed = ((usedRows ?? []) as Array<{ used_amount: number | null }>).reduce(
      (sum, row) => sum + Number(row.used_amount ?? 0),
      0
    );
    const nextUsed = approvedUsed + Number(targetRow.used_amount ?? 1);
    if (nextUsed > ANNUAL_LEAVE_QUOTA) {
      return NextResponse.json({ error: "승인 시 잔여 연차가 부족합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: "approved",
        approved_by: requester.id,
        approved_at: now,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "대기 상태 요청만 승인할 수 있습니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "승인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
