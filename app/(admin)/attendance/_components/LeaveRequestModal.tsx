"use client";

import { TapButton } from "@/app/_components/ui/crm-motion";

type Props = {
  open: boolean;
  requestType: "annual" | "half" | "sick" | "field_work";
  fromDate: string;
  toDate: string;
  reason: string;
  targetUserId?: string;
  targetUsers?: Array<{ id: string; name: string }>;
  saving: boolean;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
  onChangeReason: (value: string) => void;
  onChangeTargetUserId?: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function LeaveRequestModal(props: Props) {
  if (!props.open) return null;
  const title =
    props.requestType === "half"
      ? "반차요청"
      : props.requestType === "sick"
        ? "병가요청"
        : props.requestType === "field_work"
          ? "외근요청"
          : "연차요청";
  const placeholder =
    props.requestType === "half"
      ? "반차 사유"
      : props.requestType === "sick"
        ? "병가 사유"
        : props.requestType === "field_work"
          ? "외근 사유"
          : "연차 사유";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-3 space-y-2">
          {(props.targetUsers?.length ?? 0) > 0 ? (
            <select
              value={props.targetUserId ?? ""}
              onChange={(e) => props.onChangeTargetUserId?.(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              {(props.targetUsers ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : null}
          <input type="date" value={props.fromDate} onChange={(e) => props.onChangeFromDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          <input type="date" value={props.toDate} onChange={(e) => props.onChangeToDate(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          <textarea rows={3} value={props.reason} onChange={(e) => props.onChangeReason(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder={placeholder} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <TapButton onClick={props.onCancel} className="rounded border px-3 py-1.5 text-sm">취소</TapButton>
          <TapButton onClick={props.onSubmit} disabled={props.saving} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">{props.saving ? "저장 중..." : "요청 접수"}</TapButton>
        </div>
      </div>
    </div>
  );
}
