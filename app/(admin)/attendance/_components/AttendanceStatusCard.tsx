"use client";

import { TapButton } from "@/app/_components/ui/crm-motion";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type Props = {
  statusText: string;
  checkInText: string;
  checkOutText: string;
  loading: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onOpenLeaveModal: () => void;
};

export default function AttendanceStatusCard(props: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">오늘 내 근태 상태</h2>
        <AttendanceStatusBadge status={props.statusText} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <div className="text-xs text-zinc-500">출근 시간</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{props.checkInText}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <div className="text-xs text-zinc-500">퇴근 시간</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{props.checkOutText}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <TapButton onClick={props.onCheckIn} disabled={props.loading || !props.canCheckIn} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">출근</TapButton>
        <TapButton onClick={props.onCheckOut} disabled={props.loading || !props.canCheckOut} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">퇴근</TapButton>
        <TapButton onClick={props.onOpenLeaveModal} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">연차요청</TapButton>
      </div>
    </section>
  );
}
