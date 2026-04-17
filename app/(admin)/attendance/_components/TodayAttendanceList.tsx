"use client";

import type { AttendanceRow } from "../../_lib/attendanceSupabase";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type UserMeta = {
  name: string;
  rank: string | null;
  teamName: string | null;
  role: string | null;
};

type Props = {
  rows: AttendanceRow[];
  users: Map<string, UserMeta>;
  formatDateTime: (value: string | null | undefined) => string;
  isPastLateThreshold: boolean;
  leaveBalances?: Array<{
    userId: string;
    name: string;
    rank: string | null;
    teamName: string | null;
    remainingAnnualLeave: number;
    usedAnnualLeave: number;
    usedAnnualCount: number;
    usedHalfCount: number;
    usedSickCount: number;
  }>;
};

export default function TodayAttendanceList({ rows, users, formatDateTime, isPastLateThreshold, leaveBalances = [] }: Props) {
  const isLateAfter0930 = (value: string | null | undefined) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const threshold = new Date(d.getTime());
    threshold.setHours(9, 30, 0, 0);
    return d.getTime() > threshold.getTime();
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">오늘 근태 목록</h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">근태 데이터가 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">담당자</th>
                <th className="px-3 py-2">직급/팀</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">출근</th>
                <th className="px-3 py-2">퇴근</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((row) => {
                const meta = users.get(row.user_id);
                const isSuperAdmin = meta?.role === "super_admin";
                const checkInValue = row.check_in || row.check_in_at || null;
                let status: string = row.status || row.checkin_status || row.checkout_status || "미출근";
                if (!isSuperAdmin && checkInValue && isLateAfter0930(checkInValue)) {
                  status = "지각";
                } else if (isSuperAdmin && status === "지각") {
                  status = "정상 출근";
                } else if (!isSuperAdmin && (status === "미출근" || status === "결근") && isPastLateThreshold) {
                  status = "지각";
                }
                return (
                  <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/70">
                    <td className="px-3 py-2 font-medium text-zinc-900">{meta?.name || "알 수 없는 사용자"}</td>
                    <td className="px-3 py-2 text-zinc-600">{meta?.rank || "-"} / {meta?.teamName || "-"}</td>
                    <td className="px-3 py-2"><AttendanceStatusBadge status={status} /></td>
                    <td className="px-3 py-2 text-zinc-700">{formatDateTime(row.check_in)}</td>
                    <td className="px-3 py-2 text-zinc-700">{formatDateTime(row.check_out)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {leaveBalances.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-900">잔여 연차 현황</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">직급/팀</th>
                  <th className="px-3 py-2">연차 사용</th>
                  <th className="px-3 py-2">반차 사용</th>
                  <th className="px-3 py-2">병가 사용</th>
                  <th className="px-3 py-2">잔여</th>
                </tr>
              </thead>
              <tbody>
                {leaveBalances.map((item) => (
                  <tr key={item.userId} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-900">{item.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{item.rank || "-"} / {item.teamName || "-"}</td>
                    <td className="px-3 py-2 text-zinc-700">{item.usedAnnualCount}회</td>
                    <td className="px-3 py-2 text-zinc-700">{item.usedHalfCount}회</td>
                    <td className="px-3 py-2 text-zinc-700">{item.usedSickCount}회</td>
                    <td className="px-3 py-2 font-semibold text-indigo-700">{item.remainingAnnualLeave.toFixed(1)}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
