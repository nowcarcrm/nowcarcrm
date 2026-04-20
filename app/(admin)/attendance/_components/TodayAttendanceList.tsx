"use client";

import type { AttendanceRow } from "../../_lib/attendanceSupabase";
import {
  type AttendancePatchStatus,
  type LeaveRequestType,
  patchAttendanceRecordStatus,
} from "../../_lib/leaveRequestService";
import AttendanceStatusBadge from "./AttendanceStatusBadge";

const SICK = "\uBCD1\uAC00";
const LEAVE_LEGACY = "\uD734\uAC00";

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
  canPatchStatus?: boolean;
  onStatusPatched?: () => void;
  /** 해당일 승인된 휴가·외근 등(직원별 1건) — 오늘 목록 표시용 */
  approvedLeaveTodayByUserId?: Map<string, LeaveRequestType>;
  /** 해당일 대기 중인 외근 요청이 있는 직원 id */
  pendingFieldWorkTodayUserIds?: string[];
};

function statusToPatch(status: string): AttendancePatchStatus {
  if (status === "\uC815\uC0C1 \uCD9C\uADFC") return "normal";
  if (status === "\uC9C0\uAC01") return "late";
  if (status === "\uC5F0\uCC28") return "annual_leave";
  if (status === "\uBC18\uCC28") return "half_day";
  if (status === SICK) return "sick_leave";
  if (status === "\uC678\uADFC") return "field_work";
  if (status === LEAVE_LEGACY) return "annual_leave";
  return "normal";
}

const PATCH_OPTIONS: { v: AttendancePatchStatus; label: string }[] = [
  { v: "normal", label: "\uC815\uC0C1\uCD9C\uADFC" },
  { v: "late", label: "\uC9C0\uAC01" },
  { v: "annual_leave", label: "\uC5F0\uCC28" },
  { v: "half_day", label: "\uBC18\uCC28" },
  { v: "sick_leave", label: SICK },
  { v: "field_work", label: "\uC678\uADFC" },
];

function isLeaveLikeDbStatus(status: string): boolean {
  return (
    status === "\uC5F0\uCC28" ||
    status === "\uBC18\uCC28" ||
    status === SICK ||
    status === "\uC678\uADFC" ||
    status === "\uD734\uAC00" ||
    status === LEAVE_LEGACY
  );
}

function requestTypeToDisplayStatus(t: LeaveRequestType): string {
  if (t === "annual") return "\uC5F0\uCC28";
  if (t === "half") return "\uBC18\uCC28";
  if (t === "sick") return SICK;
  if (t === "field_work") return "\uC678\uADFC";
  return "\uD734\uAC00";
}

export default function TodayAttendanceList({
  rows,
  users,
  formatDateTime,
  isPastLateThreshold,
  leaveBalances = [],
  canPatchStatus = false,
  onStatusPatched,
  approvedLeaveTodayByUserId,
  pendingFieldWorkTodayUserIds,
}: Props) {
  const isLateAfter0930 = (value: string | null | undefined) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const threshold = new Date(d.getTime());
    threshold.setHours(9, 30, 0, 0);
    return d.getTime() > threshold.getTime();
  };

  async function onSelectChange(row: AttendanceRow, value: AttendancePatchStatus) {
    try {
      await patchAttendanceRecordStatus(row.id, value, {
        userId: row.user_id,
        date: row.work_date || row.date || undefined,
      });
      onStatusPatched?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "\uBCC0\uACBD \uC2E4\uD328");
    }
  }

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
              {rows.slice(0, 200).map((row) => {
                const meta = users.get(row.user_id);
                const isSuperAdmin = meta?.role === "super_admin";
                const checkInValue = row.check_in || row.check_in_at || null;
                const dbStatus = (row.status ?? "").trim();
                const approvedType = approvedLeaveTodayByUserId?.get(row.user_id);
                const pendingFw = pendingFieldWorkTodayUserIds?.includes(row.user_id) ?? false;
                let status: string = row.status || row.checkin_status || row.checkout_status || "미출근";

                if (checkInValue) {
                  if (!isSuperAdmin && isLateAfter0930(checkInValue)) {
                    status = "지각";
                  } else if (isSuperAdmin && status === "지각") {
                    status = "정상 출근";
                  } else if (dbStatus && isLeaveLikeDbStatus(dbStatus)) {
                    status = dbStatus;
                  }
                } else {
                  if (approvedType) {
                    status = requestTypeToDisplayStatus(approvedType);
                  } else if (dbStatus && isLeaveLikeDbStatus(dbStatus)) {
                    status = dbStatus;
                  } else if (pendingFw) {
                    status = "외근 신청중";
                  } else if (!isPastLateThreshold) {
                    status = "대기중";
                  } else {
                    status = "미출근";
                  }
                }

                const patchValue = statusToPatch(dbStatus);
                const showLateBadge = checkInValue && !isSuperAdmin && isLateAfter0930(checkInValue);
                const showPatch = canPatchStatus;
                return (
                  <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/70">
                    <td className="px-3 py-2 font-medium text-zinc-900">{meta?.name || "알 수 없는 사용자"}</td>
                    <td className="px-3 py-2 text-zinc-600">{meta?.rank || "-"} / {meta?.teamName || "-"}</td>
                    <td className="px-3 py-2">
                      {showPatch ? (
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                          {showLateBadge ? <AttendanceStatusBadge status="\uC9C0\uAC01" /> : null}
                          <select
                            className="max-w-[220px] rounded border border-zinc-300 px-2 py-1 text-xs"
                            value={patchValue}
                            onChange={(e) =>
                              void onSelectChange(row, e.target.value as AttendancePatchStatus)
                            }
                          >
                            {PATCH_OPTIONS.map((o) => (
                              <option key={o.v} value={o.v}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : showLateBadge ? (
                        <AttendanceStatusBadge status="\uC9C0\uAC01" />
                      ) : (
                        <AttendanceStatusBadge status={status} />
                      )}
                    </td>
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
