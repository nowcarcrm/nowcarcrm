import { supabase } from "./supabaseClient";

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

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
};

export type LeaveRequestsPayload = {
  myRequests: LeaveRequestItem[];
  pendingRequests: LeaveRequestItem[];
  canApprove: boolean;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

export async function listLeaveRequests(): Promise<LeaveRequestsPayload> {
  const token = await getAccessToken();
  const res = await fetch("/api/attendance/leave-requests", {
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
