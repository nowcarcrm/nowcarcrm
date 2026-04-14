"use client";

import { TapButton } from "@/app/_components/ui/crm-motion";

type Props = {
  open: boolean;
  fromDate: string;
  toDate: string;
  reason: string;
  saving: boolean;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function LeaveRequestModal(props: Props) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5">
        <h3 className="text-base font-semibold">연차요청</h3>
        <div className="mt-3 space-y-2">
          <input type="date" value={props.fromDate} onChange={(e) => props.onChangeFromDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          <input type="date" value={props.toDate} onChange={(e) => props.onChangeToDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          <textarea rows={3} value={props.reason} onChange={(e) => props.onChangeReason(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="연차 사유" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <TapButton onClick={props.onCancel} className="rounded border px-3 py-1.5 text-sm">취소</TapButton>
          <TapButton onClick={props.onSubmit} disabled={props.saving} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">{props.saving ? "저장 중..." : "요청 접수"}</TapButton>
        </div>
      </div>
    </div>
  );
}
