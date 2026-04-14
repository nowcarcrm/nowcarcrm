"use client";

export default function AttendanceRuleCard() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">자동 판정 기준</h2>
      <ul className="mt-3 space-y-2 text-sm text-zinc-600">
        <li>월~금 근무 / 토·일·공휴일 휴무</li>
        <li>09:30 이후 출근 시 지각</li>
        <li>월~목 17:45, 금요일 17:30 이전 퇴근 시 조기 퇴근</li>
        <li>연차는 요청 후 본부장 이상 승인 필요</li>
      </ul>
    </section>
  );
}
