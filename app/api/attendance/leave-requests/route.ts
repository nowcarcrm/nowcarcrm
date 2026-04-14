import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

type LeaveStatus = "pending" | "approved" | "rejected";

type UserRow = {
  id: string;
  name: string | null;
  rank: string | null;
  team_name: string | null;
  role: string | null;
  approval_status: string | null;
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

async function getRequester(authUserId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,name,rank,team_name,role,approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as UserRow;

  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from("users")
    .select("id,name,rank,team_name,role,approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (legacyErr) throw new Error(legacyErr.message);
  return (legacy as UserRow | null) ?? null;
}

function mapLeaveRow(row: LeaveRow, userMap: Map<string, UserRow>) {
  const user = userMap.get(row.user_id);
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
  };
}

export async function GET(req: Request) {
  try {
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
        "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at"
      )
      .eq("user_id", requester.id)
      .order("created_at", { ascending: false });
    if (myErr) throw new Error(myErr.message);

    let pendingRows: LeaveRow[] = [];
    if (canApprove) {
      const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select(
          "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at"
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

    return NextResponse.json({
      myRequests: ((myRows ?? []) as LeaveRow[]).map((row) => mapLeaveRow(row, userMap)),
      pendingRequests: pendingRows.map((row) => mapLeaveRow(row, userMap)),
      canApprove,
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

    const body = (await req.json()) as { fromDate?: string; toDate?: string; reason?: string };
    const fromDate = (body.fromDate ?? "").trim();
    const toDate = (body.toDate ?? "").trim();
    const reason = (body.reason ?? "").trim();

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "시작일과 종료일은 필수입니다." }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        user_id: requester.id,
        from_date: fromDate,
        to_date: toDate,
        reason: reason || null,
        status: "pending",
      })
      .select(
        "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at"
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
