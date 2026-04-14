"use client";

import type { AttendanceRow } from "../../_lib/attendanceSupabase";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type UserMeta = {
  name: string;
  rank: string | null;
  teamName: string | null;
};

type Props = {
  rows: AttendanceRow[];
  users: Map<string, UserMeta>;
  formatDateTime: (value: string | null | undefined) => string;
};

export default function TodayAttendanceList({ rows, users, formatDateTime }: Props) {
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
                const status = row.status || row.checkin_status || row.checkout_status || "미출근";
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
    </section>
  );
}
