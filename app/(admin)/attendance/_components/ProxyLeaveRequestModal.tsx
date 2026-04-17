"use client";

import { TapButton } from "@/app/_components/ui/crm-motion";
import type { LeaveRequestType } from "../../_lib/leaveRequestService";

const SICK = "\uBCD1\uAC00";
const CANCEL = "\uCDE8\uC18C";

type Props = {
  open: boolean;
  requestType: LeaveRequestType;
  targetUserId: string;
  targetUsers: Array<{ id: string; name: string }>;
  fromDate: string;
  toDate: string;
  reason: string;
  saving: boolean;
  onChangeRequestType: (t: LeaveRequestType) => void;
  onChangeTargetUserId: (id: string) => void;
  onChangeFromDate: (v: string) => void;
  onChangeToDate: (v: string) => void;
  onChangeReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function ProxyLeaveRequestModal(props: Props) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5">
        <h3 className="text-base font-semibold">대신 신청</h3>
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-zinc-600">직원</label>
          <select
            value={props.targetUserId}
            onChange={(e) => props.onChangeTargetUserId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            {props.targetUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-zinc-600">종류</label>
          <select
            value={props.requestType}
            onChange={(e) => props.onChangeRequestType(e.target.value as LeaveRequestType)}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            <option value="annual">연차</option>
            <option value="half">반차</option>
            <option value="sick">{SICK}</option>
            <option value="field_work">외근</option>
          </select>
          <input
            type="date"
            value={props.fromDate}
            onChange={(e) => props.onChangeFromDate(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={props.toDate}
            onChange={(e) => props.onChangeToDate(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            value={props.reason}
            onChange={(e) => props.onChangeReason(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="사유"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <TapButton onClick={props.onCancel} className="rounded border px-3 py-1.5 text-sm">
            {CANCEL}
          </TapButton>
          <TapButton
            onClick={props.onSubmit}
            disabled={props.saving || !props.targetUserId}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {props.saving ? "저장 중..." : "신청"}
          </TapButton>
        </div>
      </div>
    </div>
  );
}
