"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checkIn,
  checkOut,
  getLocalDateKey,
  getTodayAttendance,
  listAttendanceByMonth,
  listTodayAttendanceByUserIds,
  type AttendanceRow,
} from "../_lib/attendanceSupabase";
import {
  approveLeaveRequest,
  createLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
  type LeaveRequestType,
  type LeaveRequestItem,
} from "../_lib/leaveRequestService";
import { ensureDefaultUsers, listActiveUsers, type UserRow } from "../_lib/usersSupabase";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { filterUsersByScreenScope, getAttendanceScope } from "../_lib/screenScopes";
import AttendanceStatusCard from "./_components/AttendanceStatusCard";
import LeaveRequestCard from "./_components/LeaveRequestCard";
import LeaveApprovalList from "./_components/LeaveApprovalList";
import LeaveRequestModal from "./_components/LeaveRequestModal";
import TodayAttendanceList from "./_components/TodayAttendanceList";
import AttendanceRuleCard from "./_components/AttendanceRuleCard";
import MonthlyAttendanceSummary from "./_components/MonthlyAttendanceSummary";
import toast from "react-hot-toast";

const CURRENT_USER_KEY = "crm.current_user_id.v2";

function canApproveLeaveByRank(rank: string | null | undefined) {
  return rank === "본부장" || rank === "대표" || rank === "총괄대표";
}

function pickInitialAttendanceUserId(scoped: UserRow[], profileUserId: string) {
  if (scoped.length === 0) return "";
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(CURRENT_USER_KEY) : null;
    if (stored && scoped.some((u) => u.id === stored)) return stored;
  } catch {}
  if (profileUserId && scoped.some((u) => u.id === profileUserId)) return profileUserId;
  return scoped[0].id;
}

function dt(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function getCurrentMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function readGps(): Promise<{ latitude: number; longitude: number }> {
  if (!("geolocation" in navigator)) throw new Error("이 브라우저는 위치 정보를 지원하지 않습니다.");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => reject(new Error("GPS 위치를 가져오지 못했습니다.")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const attendanceScope = getAttendanceScope({ id: profile?.userId, role: profile?.role, rank: profile?.rank, team_name: profile?.teamName });
  const canViewAll = attendanceScope === "all" || attendanceScope === "all_except_executive";
  const canViewTeam = attendanceScope === "team";
  const canApproveLeave = canApproveLeaveByRank(profile?.rank);
  const canViewMonthlyAttendance =
    profile?.rank === "본부장" || profile?.rank === "대표" || profile?.rank === "총괄대표";
  const canRequestSickLeave = profile?.rank === "팀장";
  const todayDate = getLocalDateKey();

  const [currentUserId, setCurrentUserId] = useState("");
  const [userOptions, setUserOptions] = useState<UserRow[]>([]);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveRequestType, setLeaveRequestType] = useState<LeaveRequestType>("annual");
  const [leaveFromDate, setLeaveFromDate] = useState(getLocalDateKey());
  const [leaveToDate, setLeaveToDate] = useState(getLocalDateKey());
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [myLeaveRequests, setMyLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [monthlyRows, setMonthlyRows] = useState<
    Array<{
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
    }>
  >([]);
  const [myRemainingAnnualLeave, setMyRemainingAnnualLeave] = useState(12);
  const [visibleAnnualLeaveBalances, setVisibleAnnualLeaveBalances] = useState<
    Array<{
      userId: string;
      name: string;
      rank: string | null;
      teamName: string | null;
      remainingAnnualLeave: number;
      usedAnnualLeave: number;
      usedAnnualCount: number;
      usedHalfCount: number;
      usedSickCount: number;
    }>
  >([]);

  const isCheckedIn = !!today?.check_in;
  const isCheckedOut = !!today?.check_out;
  const approvedLeaveToday = myLeaveRequests.some((r) => r.status === "approved" && r.fromDate <= todayDate && r.toDate >= todayDate);
  const lateThreshold = useMemo(() => {
    const d = new Date();
    d.setHours(9, 30, 0, 0);
    return d.getTime();
  }, []);
  const isPastLateThreshold = Date.now() > lateThreshold;
  const isLateWithoutCheckIn = !approvedLeaveToday && !isCheckedIn && isPastLateThreshold;
  const statusText = approvedLeaveToday
    ? "승인된 연차"
    : isCheckedOut
      ? "근무 완료"
      : isCheckedIn
        ? "출근 완료"
        : isLateWithoutCheckIn
          ? "지각"
          : "미출근";
  const userMetaMap = useMemo(
    () =>
      new Map(
        userOptions.map((u) => [u.id, { name: u.name || "-", rank: u.rank ?? null, teamName: u.team_name ?? null }])
      ),
    [userOptions]
  );

  async function refreshLeaveRequests() {
    try {
      const payload = await listLeaveRequests();
      setMyLeaveRequests(payload.myRequests);
      setPendingLeaveRequests(payload.pendingRequests);
      setMyRemainingAnnualLeave(payload.myRemainingAnnualLeave);
      setVisibleAnnualLeaveBalances(payload.visibleAnnualLeaveBalances);
    } catch (e) {
      const message = e instanceof Error ? e.message : "연차/반차/병가 요청 목록을 불러오지 못했습니다.";
      toast.error(message);
    }
  }

  async function refresh() {
    if (!currentUserId) return;
    const allowedIds = userOptions.map((u) => u.id);
    const [t, list, monthList] = await Promise.all([
      getTodayAttendance(currentUserId, todayDate),
      canViewAll || canViewTeam ? listTodayAttendanceByUserIds(allowedIds) : Promise.resolve([]),
      canViewMonthlyAttendance ? listAttendanceByMonth(selectedMonth, allowedIds) : Promise.resolve([]),
    ]);
    setToday(t);
    setRows(list);
    if (canViewMonthlyAttendance) {
      const perUser = new Map<
        string,
        {
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
        }
      >();
      for (const user of userOptions) {
        perUser.set(user.id, {
          userId: user.id,
          name: user.name || "직원",
          rank: user.rank ?? null,
          teamName: user.team_name ?? null,
          total: 0,
          normal: 0,
          late: 0,
          earlyLeave: 0,
          leave: 0,
          absent: 0,
          external: 0,
        });
      }
      for (const row of monthList) {
        const item = perUser.get(row.user_id);
        if (!item) continue;
        item.total += 1;
        const status = row.status ?? "";
        if (status === "정상 출근" || status === "휴무일 근무") item.normal += 1;
        else if (status === "지각") item.late += 1;
        else if (status === "조기 퇴근") item.earlyLeave += 1;
        else if (status === "휴가") item.leave += 1;
        else if (status === "결근") item.absent += 1;
        else if (status === "외근") item.external += 1;
      }
      setMonthlyRows(
        Array.from(perUser.values())
          .filter((r) => r.total > 0)
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      );
    }
  }

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      await ensureDefaultUsers();
      const users = await listActiveUsers();
      const scoped = filterUsersByScreenScope(users, { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, name: profile.name }, attendanceScope);
      setUserOptions(scoped);
      setCurrentUserId(pickInitialAttendanceUserId(scoped, profile.userId));
      await refreshLeaveRequests();
    })();
  }, [profile, attendanceScope]);

  useEffect(() => {
    if (!currentUserId) return;
    window.localStorage.setItem(CURRENT_USER_KEY, currentUserId);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, canViewAll, canViewTeam, canViewMonthlyAttendance, selectedMonth, userOptions]);

  async function onCheckIn() {
    setLoading(true);
    try {
      const pos = await readGps();
      await checkIn(currentUserId, pos);
      await refresh();
      toast.success("출근 처리되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "출근 처리 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onCheckOut() {
    setLoading(true);
    try {
      const pos = await readGps();
      await checkOut(currentUserId, pos);
      await refresh();
      toast.success("퇴근 처리되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "퇴근 처리 실패");
    } finally {
      setLoading(false);
    }
  }

  function openLeaveModal(type: LeaveRequestType) {
    const today = getLocalDateKey();
    setLeaveRequestType(type);
    setLeaveFromDate(today);
    setLeaveToDate(today);
    setLeaveReason("");
    setLeaveModalOpen(true);
  }

  async function submitLeaveRequest() {
    if (!leaveFromDate || !leaveToDate) return toast.error("시작일과 종료일은 필수입니다.");
    if (leaveToDate < leaveFromDate) return toast.error("종료일은 시작일보다 빠를 수 없습니다.");
    setLeaveSaving(true);
    try {
      await createLeaveRequest({
        fromDate: leaveFromDate,
        toDate: leaveToDate,
        reason: leaveReason.trim(),
        requestType: leaveRequestType,
      });
      toast.success(
        leaveRequestType === "half"
          ? "반차요청이 접수되었습니다."
          : leaveRequestType === "sick"
            ? "병가요청이 접수되었습니다."
            : "연차요청이 접수되었습니다."
      );
      setLeaveModalOpen(false);
      setLeaveReason("");
      await refreshLeaveRequests();
    } catch (e) {
      const message = e instanceof Error ? e.message : "요청 접수에 실패했습니다.";
      toast.error(message);
    } finally {
      setLeaveSaving(false);
    }
  }

  return (
    <div className="crm-card">
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">근태 관리</h1>
            <select value={currentUserId} onChange={(e) => setCurrentUserId(e.target.value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
              {userOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <AttendanceStatusCard
            statusText={statusText}
            checkInText={dt(today?.check_in)}
            checkOutText={dt(today?.check_out)}
            loading={loading}
            canCheckIn={!approvedLeaveToday && !isCheckedIn}
            canCheckOut={!approvedLeaveToday && isCheckedIn && !isCheckedOut}
            onCheckIn={() => void onCheckIn()}
            onCheckOut={() => void onCheckOut()}
            onOpenLeaveModal={() => openLeaveModal("annual")}
            onOpenHalfLeaveModal={() => openLeaveModal("half")}
            canRequestSickLeave={canRequestSickLeave}
            onOpenSickLeaveModal={() => openLeaveModal("sick")}
          />

          <LeaveRequestCard requests={myLeaveRequests} />

          {canApproveLeave ? (
            <LeaveApprovalList
              requests={pendingLeaveRequests}
              onApprove={(id) => void approveLeaveRequest(id).then(refreshLeaveRequests)}
              onReject={(id) => void rejectLeaveRequest(id, (window.prompt("반려 사유", "") ?? "").trim()).then(refreshLeaveRequests)}
            />
          ) : null}

          {(canViewAll || canViewTeam) ? (
            <TodayAttendanceList
              rows={rows}
              users={userMetaMap}
              formatDateTime={dt}
              isPastLateThreshold={isPastLateThreshold}
              leaveBalances={visibleAnnualLeaveBalances}
            />
          ) : null}

          {canViewMonthlyAttendance ? (
            <MonthlyAttendanceSummary
              month={selectedMonth}
              rows={monthlyRows}
              onChangeMonth={setSelectedMonth}
            />
          ) : null}
        </div>

        <div className="space-y-5">
          <AttendanceRuleCard remainingAnnualLeave={myRemainingAnnualLeave} />
        </div>
      </div>

      <LeaveRequestModal
        open={leaveModalOpen}
        requestType={leaveRequestType}
        fromDate={leaveFromDate}
        toDate={leaveToDate}
        reason={leaveReason}
        saving={leaveSaving}
        onChangeFromDate={setLeaveFromDate}
        onChangeToDate={setLeaveToDate}
        onChangeReason={setLeaveReason}
        onCancel={() => setLeaveModalOpen(false)}
        onSubmit={() => void submitLeaveRequest()}
      />
    </div>
  );
}
