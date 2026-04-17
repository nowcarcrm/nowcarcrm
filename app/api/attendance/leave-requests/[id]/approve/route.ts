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

function eachDayInclusive(from: string, to: string): string[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const out: string[] = [];
  const cur = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function leaveTypeToAttendanceStatus(requestType: string): string {
  if (requestType === "annual") return "연차";
  if (requestType === "half") return "반차";
  if (requestType === "sick") return "병가";
  if (requestType === "field_work") return "외근";
  return "휴가";
}

function isWeekendDateKey(day: string): boolean {
  const d = new Date(`${day}T12:00:00`);
  const w = d.getDay();
  return w === 0 || w === 6;
}

async function findAttendanceRowIdForDay(userId: string, day: string): Promise<string | null> {
  const w = await supabaseAdmin
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .eq("work_date", day)
    .maybeSingle();
  if (w.error) throw new Error(w.error.message);
  if (w.data?.id) return String(w.data.id);

  const b = await supabaseAdmin
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .eq("date", day)
    .maybeSingle();
  if (b.error) throw new Error(b.error.message);
  if (b.data?.id) return String(b.data.id);

  return null;
}

async function syncAttendanceForApprovedLeave(
  userId: string,
  fromDate: string,
  toDate: string,
  requestType: string
): Promise<void> {
  const status = leaveTypeToAttendanceStatus(requestType);
  for (const day of eachDayInclusive(fromDate, toDate)) {
    const rowId = await findAttendanceRowIdForDay(userId, day);
    if (rowId) {
      const { error: updErr } = await supabaseAdmin.from("attendance").update({ status }).eq("id", rowId);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin.from("attendance").insert({
        user_id: userId,
        date: day,
        work_date: day,
        status,
        is_holiday: false,
        is_weekend: isWeekendDateKey(day),
      });
      if (insErr) throw new Error(insErr.message);
    }
  }
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
      .select("id,user_id,used_amount,status,request_type,from_date,to_date")
      .eq("id", id)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!targetRow || targetRow.status !== "pending") {
      return NextResponse.json({ error: "대기 상태 요청만 승인할 수 있습니다." }, { status: 400 });
    }

    const requestUsedAmount = Number(targetRow.used_amount ?? 1);
    const { data: targetUser, error: targetUserErr } = await supabaseAdmin
      .from("users")
      .select("id,remaining_annual_leave")
      .eq("id", targetRow.user_id)
      .maybeSingle();
    if (targetUserErr) throw new Error(targetUserErr.message);
    if (!targetUser) {
      return NextResponse.json({ error: "요청 대상 직원을 찾을 수 없습니다." }, { status: 404 });
    }
    const remainingAnnualLeave = Number(targetUser.remaining_annual_leave ?? 12);
    if (requestUsedAmount > 0 && remainingAnnualLeave < requestUsedAmount) {
      return NextResponse.json({ error: "승인 시 잔여 연차가 부족합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updatedRequest, error } = await supabaseAdmin
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
    if (!updatedRequest) {
      return NextResponse.json({ error: "대기 상태 요청만 승인할 수 있습니다." }, { status: 400 });
    }

    let balanceUpdated = false;
    if (requestUsedAmount > 0) {
      const { error: leaveUpdateErr } = await supabaseAdmin
        .from("users")
        .update({ remaining_annual_leave: Math.max(0, remainingAnnualLeave - requestUsedAmount) })
        .eq("id", targetRow.user_id);
      if (leaveUpdateErr) throw new Error(leaveUpdateErr.message);
      balanceUpdated = true;
    }

    const tr = targetRow as {
      user_id: string;
      request_type?: string | null;
      from_date?: string;
      to_date?: string;
    };
    const rt = String(tr.request_type ?? "annual");
    const fromD = String(tr.from_date ?? "");
    const toD = String(tr.to_date ?? "");

    try {
      if (fromD && toD) {
        await syncAttendanceForApprovedLeave(tr.user_id, fromD, toD, rt);
      }
    } catch (syncErr) {
      await supabaseAdmin
        .from("leave_requests")
        .update({
          status: "pending",
          approved_by: null,
          approved_at: null,
        })
        .eq("id", id);
      if (balanceUpdated && requestUsedAmount > 0) {
        await supabaseAdmin
          .from("users")
          .update({ remaining_annual_leave: remainingAnnualLeave })
          .eq("id", targetRow.user_id);
      }
      throw syncErr;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "승인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
