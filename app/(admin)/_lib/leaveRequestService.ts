import { supabase } from "./supabaseClient";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveRequestType = "annual" | "half" | "sick" | "field_work";

export type LeaveRequestItem = {
  id: string;
  userId: string;
  requesterName: string;
  requesterRank: string | null;
  requesterTeam: string | null;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: LeaveRequestStatus;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  requestType: LeaveRequestType;
  usedAmount: number;
};

export type LeaveBalanceItem = {
  userId: string;
  name: string;
  rank: string | null;
  teamName: string | null;
  remainingAnnualLeave: number;
  usedAnnualLeave: number;
  usedAnnualCount: number;
  usedHalfCount: number;
  usedSickCount: number;
};

export type LeaveRequestsPayload = {
  myRequests: LeaveRequestItem[];
  pendingRequests: LeaveRequestItem[];
  canApprove: boolean;
  myRemainingAnnualLeave: number;
  visibleAnnualLeaveBalances: LeaveBalanceItem[];
  /** coverageDate 쿼리와 함께: 해당일에 승인된 휴가/외근 등(직원별 1건) */
  approvedLeaveToday?: Array<{ userId: string; requestType: LeaveRequestType }>;
  /** 해당일에 대기 중인 외근 요청이 있는 직원 id */
  pendingFieldWorkTodayUserIds?: string[];
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

export async function listLeaveRequests(coverageDate?: string): Promise<LeaveRequestsPayload> {
  const token = await getAccessToken();
  const q =
    coverageDate && /^\d{4}-\d{2}-\d{2}$/.test(coverageDate)
      ? `?coverageDate=${encodeURIComponent(coverageDate)}`
      : "";
  const res = await fetch(`/api/attendance/leave-requests${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as LeaveRequestsPayload & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "연차요청 목록 조회에 실패했습니다.");
  return json;
}

export async function createLeaveRequest(input: {
  fromDate: string;
  toDate: string;
  reason: string;
  requestType: LeaveRequestType;
  targetUserId?: string;
}): Promise<LeaveRequestItem> {
  const token = await getAccessToken();
  const res = await fetch("/api/attendance/leave-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { request?: LeaveRequestItem; error?: string };
  if (!res.ok || !json.request) throw new Error(json.error ?? "연차요청 생성에 실패했습니다.");
  return json.request;
}

export async function approveLeaveRequest(id: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api/attendance/leave-requests/${id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "연차요청 승인에 실패했습니다.");
}

export async function rejectLeaveRequest(id: string, rejectionReason: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api/attendance/leave-requests/${id}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rejectionReason }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "연차요청 반려에 실패했습니다.");
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api/attendance/leave-requests/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "근태요청 취소에 실패했습니다.");
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api/attendance/leave-requests/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "요청 삭제에 실패했습니다.");
}


export type AttendancePatchStatus =
  | "normal"
  | "annual_leave"
  | "half_day"
  | "sick_leave"
  | "field_work";

export async function patchAttendanceRecordStatus(
  attendanceId: string,
  status: AttendancePatchStatus,
  options?: { userId?: string; date?: string }
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api/attendance/${attendanceId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      status,
      userId: options?.userId,
      date: options?.date,
    }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "근태 상태 변경에 실패했습니다.");
}
