import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { eachDayInclusive } from "@/app/(admin)/_lib/leaveDateRange";
import { checkInIsLateBySeoul0931Rule } from "@/app/(admin)/_lib/attendanceKst";

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

type AttendanceRollbackRow = {
  id: string;
  check_in: string | null;
  check_in_at: string | null;
  checkin_status: string | null;
  is_holiday: boolean | null;
  is_weekend: boolean | null;
};

async function findAttendanceRowForDay(userId: string, day: string): Promise<AttendanceRollbackRow | null> {
  const cols = "id,check_in,check_in_at,checkin_status,is_holiday,is_weekend";
  const w = await supabaseAdmin
    .from("attendance")
    .select(cols)
    .eq("user_id", userId)
    .eq("work_date", day)
    .maybeSingle();
  if (w.error) throw new Error(w.error.message);
  if (w.data) return w.data as AttendanceRollbackRow;

  const b = await supabaseAdmin
    .from("attendance")
    .select(cols)
    .eq("user_id", userId)
    .eq("date", day)
    .maybeSingle();
  if (b.error) throw new Error(b.error.message);
  return (b.data as AttendanceRollbackRow | null) ?? null;
}

/**
 * 휴가 취소 시 attendance 롤백.
 * - 출근 기록 있음: KST 09:31 룰 + checkin_status 기반으로 정상 출근/지각 복원, 휴일/주말이면 휴무일 근무
 * - 출근 기록 없음: 행 삭제 (approve 시 sync 가 새로 INSERT 했을 가능성 높음)
 */
async function rollbackAttendanceForCancelledLeave(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<void> {
  for (const day of eachDayInclusive(fromDate, toDate)) {
    const row = await findAttendanceRowForDay(userId, day);
    if (!row) continue;

    const checkIn = row.check_in ?? row.check_in_at ?? null;
    if (!checkIn) {
      const { error: delErr } = await supabaseAdmin.from("attendance").delete().eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      continue;
    }

    let restoredStatus: string;
    if (row.is_holiday || row.is_weekend) {
      restoredStatus = "휴무일 근무";
    } else if (row.checkin_status === "지각") {
      restoredStatus = "지각";
    } else {
      restoredStatus = checkInIsLateBySeoul0931Rule(checkIn) ? "지각" : "정상 출근";
    }

    const { error: updErr } = await supabaseAdmin
      .from("attendance")
      .update({ status: restoredStatus })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
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

    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });

    const { data: targetRow, error: targetErr } = await supabaseAdmin
      .from("leave_requests")
      .select("id,user_id,status,used_amount,request_type,from_date,to_date")
      .eq("id", id)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!targetRow) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    if (targetRow.status === "cancelled") {
      return NextResponse.json({ ok: true, noop: true });
    }

    /**
     * 권한 분기:
     *  - 본부장+ : 모든 상태(pending/approved) 취소 가능
     *  - 일반 직원: 본인 요청 + pending 상태만 취소 가능 (approved 는 attendance 반영됐으므로 관리자 권한 필요)
     */
    const isApprover = canCancelByRank(requester.rank);
    const isOwnRequest = String(targetRow.user_id) === String(requester.id);
    if (!isApprover && !(isOwnRequest && targetRow.status === "pending")) {
      return NextResponse.json(
        { error: "본인 대기 중 요청만 취소할 수 있습니다. 승인된 휴가는 본부장 이상에게 요청하세요." },
        { status: 403 }
      );
    }

    const originalStatus = String(targetRow.status);
    const wasApproved = originalStatus === "approved";
    const rt = String((targetRow as { request_type?: string | null }).request_type ?? "annual");
    const restoresAnnualBalance = rt === "annual" || rt === "half";
    const used = Number((targetRow as { used_amount?: number | null }).used_amount ?? 0);
    const fromD = String((targetRow as { from_date?: string }).from_date ?? "");
    const toD = String((targetRow as { to_date?: string }).to_date ?? "");
    const userId = String(targetRow.user_id);

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .neq("status", "cancelled")
      .select("id")
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    if (!updated) return NextResponse.json({ error: "이미 취소된 요청입니다." }, { status: 400 });

    let originalBalance: number | null = null;
    let balanceRestored = false;
    if (wasApproved && restoresAnnualBalance && used > 0) {
      try {
        const { data: targetUser, error: targetUserErr } = await supabaseAdmin
          .from("users")
          .select("id,remaining_annual_leave")
          .eq("id", userId)
          .maybeSingle();
        if (targetUserErr) throw new Error(targetUserErr.message);
        if (targetUser) {
          originalBalance = Number(targetUser.remaining_annual_leave ?? 12);
          const restored = originalBalance + used;
          const { error: restoreErr } = await supabaseAdmin
            .from("users")
            .update({ remaining_annual_leave: restored })
            .eq("id", userId);
          if (restoreErr) throw new Error(restoreErr.message);
          balanceRestored = true;
        }
      } catch (balanceErr) {
        /** 보상: leave_requests 원상복구 (balance 변경 없음) */
        console.error("[cancel] balance 복원 실패, leave_requests 원상복구 시도:", balanceErr);
        await supabaseAdmin
          .from("leave_requests")
          .update({ status: originalStatus })
          .eq("id", id);
        throw balanceErr;
      }
    }

    if (wasApproved && fromD && toD) {
      try {
        await rollbackAttendanceForCancelledLeave(userId, fromD, toD);
      } catch (rollbackErr) {
        /** 보상 순서: balance 차감 복원 → leave_requests 원상복구 */
        console.error("[cancel] attendance 롤백 실패, balance + leave_requests 원상복구 시도:", rollbackErr);
        if (balanceRestored && originalBalance != null) {
          await supabaseAdmin
            .from("users")
            .update({ remaining_annual_leave: originalBalance })
            .eq("id", userId);
        }
        await supabaseAdmin
          .from("leave_requests")
          .update({ status: originalStatus })
          .eq("id", id);
        throw rollbackErr;
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
