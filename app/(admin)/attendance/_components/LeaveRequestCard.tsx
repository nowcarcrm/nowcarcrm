"use client";

import type { LeaveRequestItem } from "../../_lib/leaveRequestService";
import AttendanceStatusBadge from "./AttendanceStatusBadge";
import { countInclusiveCalendarDays } from "../../_lib/leaveDateRange";

type Props = {
  requests: LeaveRequestItem[];
  canCancel?: boolean;
  onCancel?: (id: string) => void;
  /** 취소된 본인 요청을 목록에서 삭제 (DELETE API) */
  onRemoveCancelled?: (id: string) => void;
};

function leaveStatusLabel(status: LeaveRequestItem["status"]) {
  if (status === "pending") return "대기";
  if (status === "approved") return "승인";
  if (status === "cancelled") return "취소";
  return "반려";
}

function leaveTypeLabel(item: LeaveRequestItem) {
  const days = countInclusiveCalendarDays(item.fromDate, item.toDate);
  const amt = Number(item.usedAmount ?? 0);
  if (item.requestType === "sick") return `병가 (${days}일·집계 ${amt})`;
  if (item.requestType === "field_work") return `외근 (${days}일)`;
  if (item.requestType === "half") return `반차 (${days}일·${amt}회)`;
  return `연차 (${days}일·${amt}회)`;
}

export default function LeaveRequestCard({ requests, canCancel = false, onCancel, onRemoveCancelled }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">내 연차·반차·외근·병가 요청</h2>
      {requests.length === 0 ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">요청 내역이 없습니다.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {requests.slice(0, 8).map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                r.status === "cancelled" ? "border-zinc-200 bg-zinc-100/80 text-zinc-600" : "border-zinc-200"
              }`}
            >
              <div>
                <div className={`text-sm font-medium ${r.status === "cancelled" ? "text-zinc-600" : "text-zinc-900"}`}>
                  {r.fromDate} ~ {r.toDate}
                </div>
                <div className={`text-xs ${r.status === "cancelled" ? "text-zinc-500" : "text-zinc-500"}`}>
                  {leaveTypeLabel(r)} · {r.reason || "사유 없음"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === "cancelled" ? (
                  <span className="rounded-full border border-zinc-300 bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                    취소됨
                  </span>
                ) : (
                  <AttendanceStatusBadge status={leaveStatusLabel(r.status)} />
                )}
                {canCancel && r.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => onCancel?.(r.id)}
                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    취소
                  </button>
                ) : null}
                {r.status === "cancelled" && onRemoveCancelled ? (
                  <button
                    type="button"
                    onClick={() => onRemoveCancelled(r.id)}
                    className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
