"use client";

type MonthlyRow = {
  userId: string;
  name: string;
  rank: string | null;
  teamName: string | null;
  total: number;
  normal: number;
  late: number;
  earlyLeave: number;
  leave: number;
  absent: number;
  external: number;
};

type Props = {
  month: string;
  rows: MonthlyRow[];
  onChangeMonth: (value: string) => void;
};

export default function MonthlyAttendanceSummary({ month, rows, onChangeMonth }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">월간 직원 근태 현황</h2>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-zinc-600">조회 연월</label>
          <input
            type="month"
            value={month}
            onChange={(e) => onChangeMonth(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
          선택한 월의 근태 데이터가 없습니다.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">직급/팀</th>
                <th className="px-3 py-2">기록일수</th>
                <th className="px-3 py-2">정상</th>
                <th className="px-3 py-2">지각</th>
                <th className="px-3 py-2">조기퇴근</th>
                <th className="px-3 py-2">휴가</th>
                <th className="px-3 py-2">결근</th>
                <th className="px-3 py-2">외근</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium text-zinc-900">{row.name}</td>
                  <td className="px-3 py-2 text-zinc-600">
                    {row.rank || "-"} / {row.teamName || "-"}
                  </td>
                  <td className="px-3 py-2">{row.total}</td>
                  <td className="px-3 py-2">{row.normal}</td>
                  <td className="px-3 py-2">{row.late}</td>
                  <td className="px-3 py-2">{row.earlyLeave}</td>
                  <td className="px-3 py-2">{row.leave}</td>
                  <td className="px-3 py-2">{row.absent}</td>
                  <td className="px-3 py-2">{row.external}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
