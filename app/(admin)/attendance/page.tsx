"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checkIn,
  checkOut,
  getLocalDateKey,
  getTodayAttendance,
  listAttendanceByMonth,
  listTodayAttendanceByUserIds,
  mergeTodayAttendanceForActiveStaff,
  syncAutomaticLateForAttendanceRowsOnDate,
  type AttendanceRow,
} from "../_lib/attendanceSupabase";
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  deleteLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
  type LeaveRequestType,
  type LeaveRequestItem,
} from "../_lib/leaveRequestService";
import { ensureDefaultUsers, listActiveUsers, type UserRow } from "../_lib/usersSupabase";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { filterUsersByScreenScope, getAttendanceScope } from "../_lib/screenScopes";
import { canPatchAttendanceStatus, canProxyLeaveRequestByRank } from "../_lib/rolePermissions";
import AttendanceStatusCard from "./_components/AttendanceStatusCard";
import LeaveRequestCard from "./_components/LeaveRequestCard";
import LeaveApprovalList from "./_components/LeaveApprovalList";
import LeaveRequestModal from "./_components/LeaveRequestModal";
import TodayAttendanceList from "./_components/TodayAttendanceList";
import AttendanceRuleCard from "./_components/AttendanceRuleCard";
import MonthlyAttendanceSummary from "./_components/MonthlyAttendanceSummary";
import MonthAttendanceDetail from "./_components/MonthAttendanceDetail";
import ProxyLeaveRequestModal from "./_components/ProxyLeaveRequestModal";
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
  const canPatchAttendance = canPatchAttendanceStatus(
    profile
      ? { email: profile.email, role: profile.role, rank: profile.rank }
      : null
  );
  const canProxyLeave = canProxyLeaveRequestByRank(profile?.rank);
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
  const [leaveTargetUserId, setLeaveTargetUserId] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [myLeaveRequests, setMyLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  /** 월간 근태 상세 테이블 전용 조회 연월 (요약 카드의 selectedMonth와 독립) */
  const [detailListMonth, setDetailListMonth] = useState(getCurrentMonthKey());
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
  const [monthlyDetailRows, setMonthlyDetailRows] = useState<AttendanceRow[]>([]);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyRequestType, setProxyRequestType] = useState<LeaveRequestType>("annual");
  const [proxyTargetUserId, setProxyTargetUserId] = useState("");
  const [proxyFromDate, setProxyFromDate] = useState(getLocalDateKey());
  const [proxyToDate, setProxyToDate] = useState(getLocalDateKey());
  const [proxyReason, setProxyReason] = useState("");
  const [proxySaving, setProxySaving] = useState(false);
  const [approvedLeaveTodayHints, setApprovedLeaveTodayHints] = useState<
    Array<{ userId: string; requestType: LeaveRequestType }>
  >([]);
  const [pendingFieldWorkTodayIds, setPendingFieldWorkTodayIds] = useState<string[]>([]);

  const isCheckedIn = !!today?.check_in;
  const isCheckedOut = !!today?.check_out;
  const isViewingSelf = !!profile?.userId && currentUserId === profile.userId;
  /**
   * dropdown 으로 선택한 사용자의 오늘 승인된 leave 종류.
   * - 본인 선택 시: myLeaveRequests(인증자 본인 전체 leave) 에서 조회
   * - 타인 선택 시: approvedLeaveTodayHints(scope 사용자들의 오늘 승인 leave)에서 조회
   * scope='self' 직원은 hints 가 비어 오므로 회귀 방지를 위해 본인 분기는 myLeaveRequests 유지.
   */
  const selectedApprovedLeaveType: LeaveRequestType | undefined = isViewingSelf
    ? myLeaveRequests.find(
        (r) => r.status === "approved" && r.fromDate <= todayDate && r.toDate >= todayDate
      )?.requestType
    : approvedLeaveTodayHints.find((h) => h.userId === currentUserId)?.requestType;
  const approvedLeaveToday = !!selectedApprovedLeaveType;
  const lateThreshold = useMemo(() => {
    const d = new Date();
    d.setHours(9, 30, 0, 0);
    return d.getTime();
  }, []);
  const isPastLateThreshold = Date.now() > lateThreshold;
  const statusText = selectedApprovedLeaveType
    ? selectedApprovedLeaveType === "field_work"
      ? "승인된 외근"
      : selectedApprovedLeaveType === "half"
        ? "승인된 반차"
        : selectedApprovedLeaveType === "sick"
          ? "승인된 병가"
          : "승인된 연차"
    : isCheckedOut
      ? "근무 완료"
      : isCheckedIn
        ? "출근 완료"
        : !isPastLateThreshold
          ? "대기중"
          : "미출근";
  const userMetaMap = useMemo(
    () =>
      new Map(
        userOptions.map((u) => [
          u.id,
          { name: u.name || "-", rank: u.rank ?? null, teamName: u.team_name ?? null, role: u.role ?? null },
        ])
      ),
    [userOptions]
  );
  const myTeamMembers = useMemo(() => {
    if (!profile?.teamName) return [];
    return userOptions.filter((u) => u.id !== profile.userId && (u.team_name ?? "") === (profile.teamName ?? ""));
  }, [profile?.teamName, profile?.userId, userOptions]);
  const leaveModalTargetUsers = useMemo(() => {
    if (!canProxyLeave || !profile?.userId) return [];
    const self = userOptions.find((u) => u.id === profile.userId);
    const out: Array<{ id: string; name: string }> = [];
    if (self) out.push({ id: self.id, name: self.name || "-" });
    for (const u of myTeamMembers) out.push({ id: u.id, name: u.name || "-" });
    return out;
  }, [canProxyLeave, myTeamMembers, profile?.userId, userOptions]);

  const proxyTargetUsers = useMemo(() => {
    if (!profile?.userId || !canProxyLeave) return [];
    const r = (profile.rank ?? "").trim();
    if (r === "팀장") {
      return myTeamMembers.map((u) => ({ id: u.id, name: u.name || "-" }));
    }
    return userOptions
      .filter((u) => u.id !== profile.userId)
      .map((u) => ({ id: u.id, name: u.name || "-" }));
  }, [profile?.userId, profile?.rank, canProxyLeave, myTeamMembers, userOptions]);

  const monthDetailUsers = useMemo(() => {
    const m = new Map<string, { name: string; rank: string | null; teamName: string | null }>();
    for (const u of userOptions) {
      m.set(u.id, { name: u.name || "-", rank: u.rank ?? null, teamName: u.team_name ?? null });
    }
    return m;
  }, [userOptions]);

  const approvedLeaveTodayByUserIdMap = useMemo(
    () => new Map(approvedLeaveTodayHints.map((h) => [h.userId, h.requestType])),
    [approvedLeaveTodayHints]
  );

  async function refreshLeaveRequests() {
    try {
      const payload = await listLeaveRequests(todayDate);
      setMyLeaveRequests(payload.myRequests);
      setPendingLeaveRequests(payload.pendingRequests);
      setMyRemainingAnnualLeave(payload.myRemainingAnnualLeave);
      setVisibleAnnualLeaveBalances(payload.visibleAnnualLeaveBalances);
      setApprovedLeaveTodayHints(payload.approvedLeaveToday ?? []);
      setPendingFieldWorkTodayIds(payload.pendingFieldWorkTodayUserIds ?? []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "연차/반차/병가 요청 목록을 불러오지 못했습니다.";
      toast.error(message);
    }
  }

  async function refresh() {
    if (!currentUserId) return;
    const allowedIds = userOptions.map((u) => u.id);
    const monthListSummary = canViewMonthlyAttendance ? listAttendanceByMonth(selectedMonth, allowedIds) : Promise.resolve([]);
    const monthListDetail = canViewMonthlyAttendance ? listAttendanceByMonth(detailListMonth, allowedIds) : Promise.resolve([]);
    const [t0, summaryList, detailList] = await Promise.all([
      getTodayAttendance(currentUserId, todayDate),
      monthListSummary,
      monthListDetail,
    ]);
    let rawForSync: AttendanceRow[] = [];
    if (canViewAll || canViewTeam) {
      rawForSync = await listTodayAttendanceByUserIds(allowedIds);
    } else {
      rawForSync = await listTodayAttendanceByUserIds([currentUserId]);
    }
    const roleMap = new Map(userOptions.map((u) => [u.id, u.role ?? null]));
    await syncAutomaticLateForAttendanceRowsOnDate(todayDate, rawForSync, roleMap);
    const [t, rawList] = await Promise.all([
      getTodayAttendance(currentUserId, todayDate),
      canViewAll || canViewTeam ? listTodayAttendanceByUserIds(allowedIds) : listTodayAttendanceByUserIds([currentUserId]),
    ]);
    setToday(t ?? t0);
    const list =
      canViewAll || canViewTeam
        ? mergeTodayAttendanceForActiveStaff({
            today: todayDate,
            staff: userOptions,
            attendanceRows: rawList,
          })
        : rawList;
    setRows(list);
    setMonthlyDetailRows(canViewMonthlyAttendance ? detailList : []);
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
      for (const row of summaryList) {
        const item = perUser.get(row.user_id);
        if (!item) continue;
        item.total += 1;
        const status = row.status ?? "";
        if (status === "정상 출근" || status === "휴무일 근무") item.normal += 1;
        else if (status === "지각") item.late += 1;
        else if (status === "조기 퇴근") item.earlyLeave += 1;
        else if (
          status === "휴가" ||
          status === "연차" ||
          status === "반차" ||
          status === "병가"
        ) {
          item.leave += 1;
        } else if (status === "결근") item.absent += 1;
        else if (status === "외근") item.external += 1;
      }
      setMonthlyRows(Array.from(perUser.values()).sort((a, b) => a.name.localeCompare(b.name, "ko")));
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
  }, [currentUserId, canViewAll, canViewTeam, canViewMonthlyAttendance, selectedMonth, detailListMonth, userOptions]);

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
    if (leaveModalTargetUsers.length > 0) setLeaveTargetUserId(leaveModalTargetUsers[0]!.id);
    else setLeaveTargetUserId("");
    setLeaveModalOpen(true);
  }

  async function submitLeaveRequest() {
    if (!leaveFromDate || !leaveToDate) return toast.error("시작일과 종료일은 필수입니다.");
    if (leaveToDate < leaveFromDate) return toast.error("종료일은 시작일보다 빠를 수 없습니다.");
    if (leaveModalTargetUsers.length > 0 && !leaveTargetUserId) {
      return toast.error("요청할 직원을 선택해 주세요.");
    }
    setLeaveSaving(true);
    try {
      await createLeaveRequest({
        fromDate: leaveFromDate,
        toDate: leaveToDate,
        reason: leaveReason.trim(),
        requestType: leaveRequestType,
        targetUserId: leaveTargetUserId || undefined,
      });
      toast.success(
        leaveRequestType === "half"
          ? "반차요청이 접수되었습니다."
          : leaveRequestType === "sick"
            ? "병가요청이 접수되었습니다."
            : leaveRequestType === "field_work"
              ? "외근요청이 접수되었습니다."
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

  async function onCancelLeaveRequest(id: string) {
    const ok = window.confirm("이 근태 요청을 취소할까요?");
    if (!ok) return;
    try {
      await cancelLeaveRequest(id);
      toast.success("근태 요청을 취소했습니다.");
      await refreshLeaveRequests();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "취소에 실패했습니다.");
    }
  }

  async function onRemoveCancelledMyRequest(id: string) {
    const ok = window.confirm("목록에서 제거하시겠습니까?");
    if (!ok) return;
    try {
      await deleteLeaveRequest(id);
      toast.success("목록에서 삭제했습니다.");
      await refreshLeaveRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  async function onDeletePendingLeaveRequest(id: string) {
    const ok = window.confirm("이 요청을 목록에서 완전히 삭제하시겠습니까?");
    if (!ok) return;
    try {
      await deleteLeaveRequest(id);
      toast.success("요청을 완전히 삭제했습니다.");
      await refreshLeaveRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }


  function openProxyLeaveModal() {
    const d = getLocalDateKey();
    setProxyRequestType("annual");
    setProxyFromDate(d);
    setProxyToDate(d);
    setProxyReason("");
    setProxyTargetUserId(proxyTargetUsers[0]?.id ?? "");
    setProxyModalOpen(true);
  }

  async function submitProxyLeaveRequest() {
    if (!proxyTargetUserId) return toast.error("대신 신청할 직원을 선택해 주세요.");
    if (!proxyFromDate || !proxyToDate) return toast.error("시작일과 종료일은 필수입니다.");
    if (proxyToDate < proxyFromDate) return toast.error("종료일은 시작일보다 빠를 수 없습니다.");
    setProxySaving(true);
    try {
      await createLeaveRequest({
        fromDate: proxyFromDate,
        toDate: proxyToDate,
        reason: proxyReason.trim(),
        requestType: proxyRequestType,
        targetUserId: proxyTargetUserId,
      });
      toast.success("대신 신청이 접수되었습니다.");
      setProxyModalOpen(false);
      setProxyReason("");
      await refreshLeaveRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청 접수에 실패했습니다.");
    } finally {
      setProxySaving(false);
    }
  }


  return (
    <div className="crm-card">
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">근태 관리</h1>
            <div className="flex flex-wrap items-center gap-2">
              {canProxyLeave && proxyTargetUsers.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openProxyLeaveModal()}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800"
                >
                  대신 신청
                </button>
              ) : null}
              <select value={currentUserId} onChange={(e) => setCurrentUserId(e.target.value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
              {userOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
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
            onOpenFieldWorkModal={() => openLeaveModal("field_work")}
            onOpenSickLeaveModal={() => openLeaveModal("sick")}
          />

          {isViewingSelf ? (
            <LeaveRequestCard
              requests={myLeaveRequests}
              /**
               * 본부장+ 는 모든 status(pending/approved) 취소 가능,
               * 일반 직원 본인은 pending 만 취소 가능.
               * myLeaveRequests 는 인증자 본인 row 만 들어오므로 r.userId 체크는 사실상 항상 true 이지만 명시적으로 둠.
               */
              canCancelRequest={(r) =>
                canApproveLeave ||
                (!!profile?.userId && r.userId === profile.userId && r.status === "pending")
              }
              onCancel={(id) => void onCancelLeaveRequest(id)}
              onRemoveCancelled={(id) => void onRemoveCancelledMyRequest(id)}
            />
          ) : (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">내 연차·반차·외근·병가 요청</h2>
              <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                현재 다른 직원의 화면을 조회 중입니다. 본인 요청을 보려면 상단 직원 선택을 본인으로 변경하세요.
              </p>
            </section>
          )}

          {canApproveLeave ? (
            <LeaveApprovalList
              requests={pendingLeaveRequests}
              onApprove={(id) =>
                void approveLeaveRequest(id).then(async () => {
                  await refreshLeaveRequests();
                  await refresh();
                })
              }
              onReject={(id) => void rejectLeaveRequest(id, (window.prompt("반려 사유", "") ?? "").trim()).then(refreshLeaveRequests)}
              onDelete={(id) => void onDeletePendingLeaveRequest(id)}
            />
          ) : null}

          {(canViewAll || canViewTeam) ? (
            <TodayAttendanceList
              rows={rows}
              users={userMetaMap}
              formatDateTime={dt}
              isPastLateThreshold={isPastLateThreshold}
              leaveBalances={visibleAnnualLeaveBalances}
              canPatchStatus={canPatchAttendance}
              onStatusPatched={() => void refresh()}
              approvedLeaveTodayByUserId={approvedLeaveTodayByUserIdMap}
              pendingFieldWorkTodayUserIds={pendingFieldWorkTodayIds}
              memberDetailEnabled={canViewAll || canViewTeam}
            />
          ) : null}

          {canViewMonthlyAttendance ? (
            <>
              <MonthlyAttendanceSummary
                month={selectedMonth}
                rows={monthlyRows}
                onChangeMonth={setSelectedMonth}
              />
              <MonthAttendanceDetail
                detailMonth={detailListMonth}
                rows={monthlyDetailRows}
                users={monthDetailUsers}
                canPatch={canPatchAttendance}
                onPatched={() => void refresh()}
                onApplyDetailMonth={(ym) => setDetailListMonth(ym)}
              />
            </>
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
        targetUserId={leaveTargetUserId}
        targetUsers={leaveModalTargetUsers}
        saving={leaveSaving}
        onChangeFromDate={setLeaveFromDate}
        onChangeToDate={setLeaveToDate}
        onChangeReason={setLeaveReason}
        onChangeTargetUserId={setLeaveTargetUserId}
        onCancel={() => setLeaveModalOpen(false)}
        onSubmit={() => void submitLeaveRequest()}
      />

      <ProxyLeaveRequestModal
        open={proxyModalOpen}
        requestType={proxyRequestType}
        targetUserId={proxyTargetUserId}
        targetUsers={proxyTargetUsers}
        fromDate={proxyFromDate}
        toDate={proxyToDate}
        reason={proxyReason}
        saving={proxySaving}
        onChangeRequestType={setProxyRequestType}
        onChangeTargetUserId={setProxyTargetUserId}
        onChangeFromDate={setProxyFromDate}
        onChangeToDate={setProxyToDate}
        onChangeReason={setProxyReason}
        onCancel={() => setProxyModalOpen(false)}
        onSubmit={() => void submitProxyLeaveRequest()}
      />
    </div>
  );
}
