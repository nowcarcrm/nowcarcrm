"use client";

import { TapButton } from "@/app/_components/ui/crm-motion";
import type { LeaveRequestItem } from "../../_lib/leaveRequestService";

type Props = {
  requests: LeaveRequestItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function LeaveApprovalList({ requests, onApprove, onReject, onDelete }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-zinc-900">연차 요청 대기 목록</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-zinc-500">대기 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2 text-sm">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2">
              <span className="text-zinc-800">
                {r.requesterName} / {r.requesterRank || "-"} / {r.requesterTeam || "-"} / {r.fromDate}~{r.toDate} /{" "}
                {r.requestType === "half"
                  ? "반차 0.5회"
                  : r.requestType === "sick"
                    ? "병가 차감 없음"
                    : r.requestType === "field_work"
                      ? "외근 차감 없음"
                      : "연차 1회"}
              </span>
              <div className="flex gap-2">
                <TapButton onClick={() => onApprove(r.id)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">승인</TapButton>
                <TapButton onClick={() => onReject(r.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">반려</TapButton>
                <TapButton onClick={() => onDelete(r.id)} className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">삭제</TapButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
