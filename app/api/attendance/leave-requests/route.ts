import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { canProxyLeaveRequestByRank } from "@/app/(admin)/_lib/rolePermissions";
import { countInclusiveCalendarDays } from "@/app/(admin)/_lib/leaveDateRange";
import { filterUsersByScreenScope, getAttendanceScope, isProtectedExecutiveUser } from "@/app/(admin)/_lib/screenScopes";
import type { UserRow as StaffUserRow } from "@/app/(admin)/_lib/usersSupabase";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveRequestType = "annual" | "half" | "sick" | "field_work";
const ANNUAL_LEAVE_QUOTA = 12;
const ANNUAL_LEAVE_VIEWABLE_RANKS = new Set(["주임", "대리", "과장", "차장", "팀장"]);

type UserRow = {
  id: string;
  name: string | null;
  rank: string | null;
  team_name: string | null;
  role: string | null;
  approval_status: string | null;
  remaining_annual_leave?: number | null;
};

type LeaveRow = {
  id: string;
  user_id: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  request_type: LeaveRequestType;
  used_amount: number;
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function isApproved(status: string | null | undefined): boolean {
  return status === "approved";
}

function canApproveByRank(rank: string | null | undefined): boolean {
  return rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

function canViewAllowanceByRank(rank: string | null | undefined): boolean {
  return rank === "팀장" || rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

async function assertProxyTarget(requester: UserRow, targetUserId: string): Promise<string> {
  const { data: targetUser, error: targetErr } = await supabaseAdmin
    .from("users")
    .select("id,name,team_name,approval_status,rank")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!targetUser || !isApproved(targetUser.approval_status)) {
    throw new Error("요청 대상 직원을 찾을 수 없습니다.");
  }
  const r = (requester.rank ?? "").trim();
  if (r === "팀장") {
    if ((targetUser.team_name ?? "") !== (requester.team_name ?? "")) {
      throw new Error("같은 팀 소속 직원만 대신 요청할 수 있습니다.");
    }
    return targetUser.id;
  }
  if (r === "본부장") {
    if (isProtectedExecutiveUser({ rank: targetUser.rank ?? null, name: targetUser.name ?? null })) {
      throw new Error("해당 직원에게는 대신 요청할 수 없습니다.");
    }
    return targetUser.id;
  }
  if (r === "대표" || r === "총괄대표") {
    return targetUser.id;
  }
  throw new Error("대신 요청 권한이 없습니다.");
}

function thisYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

async function getApprovedUsageMap(userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const { start, end } = thisYearRange();
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("user_id,used_amount")
    .eq("status", "approved")
    .gte("from_date", start)
    .lte("from_date", end)
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ user_id: string; used_amount: number | null }>) {
    const prev = map.get(row.user_id) ?? 0;
    map.set(row.user_id, prev + Number(row.used_amount ?? 0));
  }
  return map;
}

async function getApprovedUsageRows(userIds: string[]) {
  if (!userIds.length) return [] as Array<{ user_id: string; used_amount: number | null; request_type: LeaveRequestType | null }>;
  const { start, end } = thisYearRange();
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("user_id,used_amount,request_type")
    .eq("status", "approved")
    .gte("from_date", start)
    .lte("from_date", end)
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ user_id: string; used_amount: number | null; request_type: LeaveRequestType | null }>;
}

async function getRequester(authUserId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,name,rank,team_name,role,approval_status,remaining_annual_leave")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as UserRow;

  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from("users")
    .select("id,name,rank,team_name,role,approval_status,remaining_annual_leave")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (legacyErr) throw new Error(legacyErr.message);
  return (legacy as UserRow | null) ?? null;
}

function mapLeaveRow(row: LeaveRow, userMap: Map<string, UserRow>) {
  const user = userMap.get(row.user_id);
  let requestType: LeaveRequestType = "annual";
  if (row.request_type === "half") requestType = "half";
  else if (row.request_type === "sick") requestType = "sick";
  else if (row.request_type === "field_work") requestType = "field_work";
  return {
    id: row.id,
    userId: row.user_id,
    requesterName: user?.name ?? "직원",
    requesterRank: user?.rank ?? null,
    requesterTeam: user?.team_name ?? null,
    fromDate: row.from_date,
    toDate: row.to_date,
    reason: row.reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    requestType,
    usedAmount: Number(row.used_amount ?? 1),
  };
}

export async function GET(req: Request) {
  try {
    const coverageDate = new URL(req.url).searchParams.get("coverageDate")?.trim() ?? "";

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const requester = await getRequester(authData.user.id);
    if (!requester || !isApproved(requester.approval_status)) {
      return NextResponse.json({ error: "승인된 사용자만 연차요청을 조회할 수 있습니다." }, { status: 403 });
    }

    const canApprove = canApproveByRank(requester.rank);

    const { data: myRows, error: myErr } = await supabaseAdmin
      .from("leave_requests")
      .select(
        "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at,request_type,used_amount"
      )
      .eq("user_id", requester.id)
      .order("created_at", { ascending: false });
    if (myErr) throw new Error(myErr.message);

    let pendingRows: LeaveRow[] = [];
    if (canApprove) {
      const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select(
          "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at,request_type,used_amount"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      pendingRows = (data ?? []) as LeaveRow[];
    }

    const userIds = Array.from(
      new Set([requester.id, ...(myRows ?? []).map((r) => r.user_id), ...pendingRows.map((r) => r.user_id)])
    );
    const { data: usersData, error: usersErr } = await supabaseAdmin
      .from("users")
      .select("id,name,rank,team_name,role,approval_status")
      .in("id", userIds);
    if (usersErr) throw new Error(usersErr.message);
    const userMap = new Map<string, UserRow>((usersData ?? []).map((u) => [u.id, u as UserRow]));

    const myRemainingAnnualLeave = Number(requester.remaining_annual_leave ?? ANNUAL_LEAVE_QUOTA);

    let visibleAnnualLeaveBalances: Array<{
      userId: string;
      name: string;
      rank: string | null;
      teamName: string | null;
      remainingAnnualLeave: number;
      usedAnnualLeave: number;
    }> = [];
    if (canViewAllowanceByRank(requester.rank)) {
      const { data: targetUsers, error: targetErr } = await supabaseAdmin
        .from("users")
        .select("id,name,rank,team_name,approval_status,remaining_annual_leave")
        .or("approval_status.eq.approved,approval_status.is.null");
      if (targetErr) throw new Error(targetErr.message);
      const filteredTargets = ((targetUsers ?? []) as UserRow[]).filter((u) => {
        if (!ANNUAL_LEAVE_VIEWABLE_RANKS.has((u.rank ?? "").trim())) return false;
        if (requester.rank === "팀장") return (u.team_name ?? "") === (requester.team_name ?? "");
        return true;
      });
      const targetIds = filteredTargets.map((u) => u.id).filter(Boolean);
      const targetUsageMap = await getApprovedUsageMap(targetIds);
      const usageRows = await getApprovedUsageRows(targetIds);
      const breakdownMap = new Map<string, { annual: number; half: number; sick: number }>();
      for (const row of usageRows) {
        const current = breakdownMap.get(row.user_id) ?? { annual: 0, half: 0, sick: 0 };
        const amt = Number(row.used_amount ?? 0);
        if (row.request_type === "half") current.half += amt;
        else if (row.request_type === "sick") current.sick += amt;
        else if (row.request_type === "field_work") {
          /* field_work: 연차/병가 집계 제외 */
        } else current.annual += amt;
        breakdownMap.set(row.user_id, current);
      }
      visibleAnnualLeaveBalances = filteredTargets
        .map((u) => {
          const used = targetUsageMap.get(u.id) ?? 0;
          const breakdown = breakdownMap.get(u.id) ?? { annual: 0, half: 0, sick: 0 };
          return {
            userId: u.id,
            name: u.name ?? "직원",
            rank: u.rank ?? null,
            teamName: u.team_name ?? null,
            usedAnnualLeave: used,
            remainingAnnualLeave: Number(u.remaining_annual_leave ?? Math.max(0, ANNUAL_LEAVE_QUOTA - used)),
            usedAnnualCount: breakdown.annual,
            usedHalfCount: breakdown.half,
            usedSickCount: breakdown.sick,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }

    let approvedLeaveToday: Array<{ userId: string; requestType: LeaveRequestType }> = [];
    let pendingFieldWorkTodayUserIds: string[] = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(coverageDate)) {
      const viewerLike = {
        id: requester.id,
        role: requester.role,
        rank: requester.rank,
        team_name: requester.team_name,
        name: requester.name,
      };
      const scope = getAttendanceScope(viewerLike);
      if (scope === "all" || scope === "all_except_executive" || scope === "team") {
        const { data: scopeUsers, error: suErr } = await supabaseAdmin
          .from("users")
          .select("id,name,rank,team_name,role,approval_status,is_active")
          .or("approval_status.eq.approved,approval_status.is.null");
        if (!suErr && scopeUsers?.length) {
          const filtered = filterUsersByScreenScope(scopeUsers as StaffUserRow[], viewerLike, scope);
          const ids = filtered.map((u) => u.id).filter(Boolean);
          if (ids.length) {
            const { data: covRows, error: covErr } = await supabaseAdmin
              .from("leave_requests")
              .select("user_id,request_type,approved_at")
              .eq("status", "approved")
              .lte("from_date", coverageDate)
              .gte("to_date", coverageDate)
              .in("user_id", ids);
            if (!covErr && covRows?.length) {
              const last = new Map<string, { rt: LeaveRequestType; at: string }>();
              for (const row of covRows as Array<{ user_id: string; request_type: string | null; approved_at: string | null }>) {
                let rt: LeaveRequestType = "annual";
                if (row.request_type === "half") rt = "half";
                else if (row.request_type === "sick") rt = "sick";
                else if (row.request_type === "field_work") rt = "field_work";
                const at = row.approved_at ?? "";
                const prev = last.get(row.user_id);
                if (!prev || at >= prev.at) last.set(row.user_id, { rt, at });
              }
              approvedLeaveToday = Array.from(last.entries()).map(([userId, v]) => ({ userId, requestType: v.rt }));
            }

            const { data: pendRows } = await supabaseAdmin
              .from("leave_requests")
              .select("user_id")
              .eq("status", "pending")
              .eq("request_type", "field_work")
              .lte("from_date", coverageDate)
              .gte("to_date", coverageDate)
              .in("user_id", ids);
            pendingFieldWorkTodayUserIds = [
              ...new Set((pendRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean)),
            ];
          }
        }
      }
    }

    return NextResponse.json({
      myRequests: ((myRows ?? []) as LeaveRow[]).map((row) => mapLeaveRow(row, userMap)),
      pendingRequests: pendingRows.map((row) => mapLeaveRow(row, userMap)),
      canApprove,
      myRemainingAnnualLeave,
      visibleAnnualLeaveBalances,
      approvedLeaveToday,
      pendingFieldWorkTodayUserIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "연차요청 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const requester = await getRequester(authData.user.id);
    if (!requester || !isApproved(requester.approval_status)) {
      return NextResponse.json({ error: "승인된 사용자만 연차요청을 생성할 수 있습니다." }, { status: 403 });
    }

    const body = (await req.json()) as {
      fromDate?: string;
      toDate?: string;
      reason?: string;
      requestType?: LeaveRequestType;
      targetUserId?: string;
    };
    const fromDate = (body.fromDate ?? "").trim();
    const toDate = (body.toDate ?? "").trim();
    const reason = (body.reason ?? "").trim();
    let requestType: LeaveRequestType = "annual";
    if (body.requestType === "half") requestType = "half";
    else if (body.requestType === "sick") requestType = "sick";
    else if (body.requestType === "field_work") requestType = "field_work";

    const rawTarget = (body.targetUserId ?? "").trim();
    const isProxyRequest = rawTarget.length > 0 && rawTarget !== requester.id;

    const dayCount = countInclusiveCalendarDays(fromDate, toDate);
    if (dayCount <= 0) {
      return NextResponse.json({ error: "유효한 기간이 아닙니다." }, { status: 400 });
    }
    let usedAmount = 0;
    if (requestType === "annual") usedAmount = dayCount;
    else if (requestType === "half") usedAmount = dayCount * 0.5;
    else if (requestType === "sick") usedAmount = dayCount;
    else usedAmount = 0;

    if (isProxyRequest && !canProxyLeaveRequestByRank(requester.rank)) {
      return NextResponse.json({ error: "대신 요청은 팀장·본부장·대표·총괄대표만 가능합니다." }, { status: 403 });
    }

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "시작일과 종료일은 필수입니다." }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
    }

    let requestTargetUserId = requester.id;
    if (isProxyRequest) {
      try {
        requestTargetUserId = await assertProxyTarget(requester, rawTarget);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "요청 대상을 확인하지 못했습니다." },
          { status: 400 }
        );
      }
    }

    const { data: targetLeaveUser, error: targetLeaveUserErr } = await supabaseAdmin
      .from("users")
      .select("id,remaining_annual_leave")
      .eq("id", requestTargetUserId)
      .maybeSingle();
    if (targetLeaveUserErr) throw new Error(targetLeaveUserErr.message);
    const remainingAnnualLeave = Number(targetLeaveUser?.remaining_annual_leave ?? ANNUAL_LEAVE_QUOTA);
    const needsAnnualBalance = requestType === "annual" || requestType === "half";
    if (needsAnnualBalance && usedAmount > 0 && remainingAnnualLeave < usedAmount) {
      return NextResponse.json({ error: "잔여 연차가 부족합니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        user_id: requestTargetUserId,
        from_date: fromDate,
        to_date: toDate,
        reason: reason || null,
        status: "pending",
        request_type: requestType,
        used_amount: usedAmount,
        requested_by: isProxyRequest ? requester.id : null,
      })
      .select(
        "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at,request_type,used_amount"
      )
      .single();

    if (error) throw new Error(error.message);

    const request = mapLeaveRow(data as LeaveRow, new Map([[requester.id, requester]]));
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "연차요청 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
