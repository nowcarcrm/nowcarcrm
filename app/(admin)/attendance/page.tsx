"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checkIn,
  checkOut,
  getLocalDateKey,
  getTodayAttendance,
  listAttendance,
  type AttendanceRow,
} from "../_lib/attendanceSupabase";
import {
  approveLeaveRequest,
  createLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
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
  const todayDate = getLocalDateKey();

  const [currentUserId, setCurrentUserId] = useState("");
  const [userOptions, setUserOptions] = useState<UserRow[]>([]);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveFromDate, setLeaveFromDate] = useState(getLocalDateKey());
  const [leaveToDate, setLeaveToDate] = useState(getLocalDateKey());
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [myLeaveRequests, setMyLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequestItem[]>([]);

  const isCheckedIn = !!today?.check_in;
  const isCheckedOut = !!today?.check_out;
  const approvedLeaveToday = myLeaveRequests.some((r) => r.status === "approved" && r.fromDate <= todayDate && r.toDate >= todayDate);
  const statusText = approvedLeaveToday ? "승인된 연차" : isCheckedOut ? "근무 완료" : isCheckedIn ? "출근 완료" : "미출근";
  const userMetaMap = useMemo(
    () =>
      new Map(
        userOptions.map((u) => [u.id, { name: u.name || "-", rank: u.rank ?? null, teamName: u.team_name ?? null }])
      ),
    [userOptions]
  );

  async function refreshLeaveRequests() {
    const payload = await listLeaveRequests();
    setMyLeaveRequests(payload.myRequests);
    setPendingLeaveRequests(payload.pendingRequests);
  }

  async function refresh() {
    if (!currentUserId) return;
    const allowedIds = userOptions.map((u) => u.id);
    const [t, list] = await Promise.all([
      getTodayAttendance(currentUserId, todayDate),
      canViewAll || canViewTeam ? listAttendance(200, allowedIds) : Promise.resolve([]),
    ]);
    setToday(t);
    setRows(list);
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
  }, [currentUserId, canViewAll, canViewTeam]);

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

  async function submitLeaveRequest() {
    if (!leaveFromDate || !leaveToDate) return toast.error("시작일과 종료일은 필수입니다.");
    if (leaveToDate < leaveFromDate) return toast.error("종료일은 시작일보다 빠를 수 없습니다.");
    setLeaveSaving(true);
    try {
      await createLeaveRequest({ fromDate: leaveFromDate, toDate: leaveToDate, reason: leaveReason.trim() });
      toast.success("연차요청이 접수되었습니다.");
      setLeaveModalOpen(false);
      setLeaveReason("");
      await refreshLeaveRequests();
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
            onOpenLeaveModal={() => setLeaveModalOpen(true)}
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
            <TodayAttendanceList rows={rows} users={userMetaMap} formatDateTime={dt} />
          ) : null}
        </div>

        <div className="space-y-5">
          <AttendanceRuleCard />
        </div>
      </div>

      <LeaveRequestModal
        open={leaveModalOpen}
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
