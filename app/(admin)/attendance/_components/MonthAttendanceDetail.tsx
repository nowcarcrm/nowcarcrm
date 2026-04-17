"use client";

import { normalizeAttendanceRow, type AttendanceRow } from "../../_lib/attendanceSupabase";
import { type AttendancePatchStatus, patchAttendanceRecordStatus } from "../../_lib/leaveRequestService";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type UserMeta = { name: string; rank: string | null; teamName: string | null };

type Props = {
  month: string;
  rows: AttendanceRow[];
  users: Map<string, UserMeta>;
  canPatch: boolean;
  onPatched: () => void;
};

const SICK = "\uBCD1\uAC00";
const LEAVE_LEGACY = "\uD734\uAC00";
const MONTH_DETAIL_TITLE = "\uC6D4\uAC04 \uADFC\uD0DC \uC0C1\uC138";
const NO_DATA = "\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
const COL_ASSIGNEE = "\uB2F4\uB2F9\uC790";

function statusToPatch(status: string): AttendancePatchStatus {
  if (status === "정상 출근") return "normal";
  if (status === "연차") return "annual_leave";
  if (status === "반차") return "half_day";
  if (status === SICK) return "sick_leave";
  if (status === "외근") return "field_work";
  if (status === LEAVE_LEGACY) return "annual_leave";
  return "normal";
}

const OPTIONS: { v: AttendancePatchStatus; label: string }[] = [
  { v: "normal", label: "정상출근" },
  { v: "annual_leave", label: "연차" },
  { v: "half_day", label: "반차" },
  { v: "sick_leave", label: SICK },
  { v: "field_work", label: "외근" },
];

export default function MonthAttendanceDetail({ month, rows, users, canPatch, onPatched }: Props) {
  const sorted = [...rows].sort((a, b) => {
    const da = normalizeAttendanceRow(a)?.normalized_date ?? "";
    const db = normalizeAttendanceRow(b)?.normalized_date ?? "";
    if (da !== db) return da.localeCompare(db);
    const na = users.get(a.user_id)?.name ?? "";
    const nb = users.get(b.user_id)?.name ?? "";
    return na.localeCompare(nb, "ko");
  });

  async function onSelectChange(rowId: string, value: AttendancePatchStatus) {
    try {
      await patchAttendanceRecordStatus(rowId, value);
      onPatched();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "변경 실패");
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">
        {MONTH_DETAIL_TITLE} ({month})
      </h2>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{NO_DATA}</p>
      ) : (
        <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">일자</th>
                <th className="px-3 py-2">{COL_ASSIGNEE}</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const meta = users.get(row.user_id);
                const d = normalizeAttendanceRow(row)?.normalized_date ?? "-";
                const st = row.status ?? "-";
                return (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-700">{d}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{meta?.name ?? "-"}</td>
                    <td className="px-3 py-2">
                      {canPatch ? (
                        <select
                          className="max-w-[200px] rounded border border-zinc-300 px-2 py-1 text-xs"
                          value={statusToPatch(st)}
                          onChange={(e) => void onSelectChange(row.id, e.target.value as AttendancePatchStatus)}
                        >
                          {OPTIONS.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <AttendanceStatusBadge status={st} />
                      )}
                    </td>
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
