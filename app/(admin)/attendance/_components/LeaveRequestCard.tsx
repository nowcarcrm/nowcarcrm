"use client";

import type { LeaveRequestItem } from "../../_lib/leaveRequestService";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type Props = {
  requests: LeaveRequestItem[];
};

function leaveStatusLabel(status: LeaveRequestItem["status"]) {
  if (status === "pending") return "대기";
  if (status === "approved") return "승인";
  return "반려";
}

function leaveTypeLabel(item: LeaveRequestItem) {
  if (item.requestType === "sick") return "병가 (차감 없음)";
  if (item.requestType === "half") return "반차 (0.5회)";
  return "연차 (1회)";
}

export default function LeaveRequestCard({ requests }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">내 연차,반차요청 상태</h2>
      {requests.length === 0 ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">요청 내역이 없습니다.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {requests.slice(0, 8).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-zinc-900">{r.fromDate} ~ {r.toDate}</div>
                <div className="text-xs text-zinc-500">{leaveTypeLabel(r)} · {r.reason || "사유 없음"}</div>
              </div>
              <AttendanceStatusBadge status={leaveStatusLabel(r.status)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
