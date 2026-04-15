"use client";

type Props = {
  remainingAnnualLeave: number;
};

export default function AttendanceRuleCard({ remainingAnnualLeave }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">자동 판정 기준</h2>
      <ul className="mt-3 space-y-2 text-sm text-zinc-600">
        <li>월~금 근무 / 토·일·공휴일 휴무</li>
        <li>09:30 이후 출근 시 지각</li>
        <li>월~목 17:45, 금요일 17:30 이전 퇴근 시 조기 퇴근</li>
        <li>연차는 요청 후 본부장 이상 승인 필요</li>
      </ul>
      <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
        <div className="text-xs font-semibold text-indigo-700">나의 잔여연차</div>
        <div className="mt-1 text-lg font-bold text-indigo-900">{remainingAnnualLeave.toFixed(1)}회</div>
        <p className="mt-1 text-xs text-indigo-700/80">매년 1월 1일 기준으로 12회로 초기화됩니다.</p>
      </div>
    </section>
  );
}
