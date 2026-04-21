"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeAttendanceRow, type AttendanceRow } from "../../_lib/attendanceSupabase";
import { type AttendancePatchStatus, patchAttendanceRecordStatus } from "../../_lib/leaveRequestService";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

type UserMeta = { name: string; rank: string | null; teamName: string | null };

type Props = {
  /** 현재 표시 중인 상세 데이터의 연-월 (YYYY-MM) */
  detailMonth: string;
  rows: AttendanceRow[];
  users: Map<string, UserMeta>;
  canPatch: boolean;
  onPatched: () => void;
  /** [조회] 클릭 시 상위에서 상세 월 변경 */
  onApplyDetailMonth: (yearMonth: string) => void;
};

const SICK = "\uBCD1\uAC00";
const LEAVE_LEGACY = "\uD734\uAC00";

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

export default function MonthAttendanceDetail({
  detailMonth,
  rows,
  users,
  canPatch,
  onPatched,
  onApplyDetailMonth,
}: Props) {
  const nowY = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = nowY - 3; y <= nowY + 3; y += 1) ys.push(y);
    return ys;
  }, [nowY]);

  const [draftYear, setDraftYear] = useState(() => Number(detailMonth.split("-")[0]) || nowY);
  const [draftMonth, setDraftMonth] = useState(() => Number(detailMonth.split("-")[1]) || 1);

  useEffect(() => {
    const [y, m] = detailMonth.split("-").map(Number);
    if (Number.isFinite(y)) setDraftYear(y);
    if (Number.isFinite(m)) setDraftMonth(m);
  }, [detailMonth]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">월간 근태 상세 ({detailMonth})</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-zinc-600">연도</label>
          <select
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            value={draftYear}
            onChange={(e) => setDraftYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="text-zinc-600">월</label>
          <select
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            value={draftMonth}
            onChange={(e) => setDraftMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onApplyDetailMonth(`${draftYear}-${String(draftMonth).padStart(2, "0")}`)}
            className="rounded-lg border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            조회
          </button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">데이터가 없습니다.</p>
      ) : (
        <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">일자</th>
                <th className="px-3 py-2">담당자</th>
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
