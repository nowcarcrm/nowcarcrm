"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addHoliday,
  approveHolidayWork,
  checkIn,
  checkOut,
  deleteHoliday,
  getActivitySummaryByUserDate,
  getActivitySummaryMapByDate,
  getLocalDateKey,
  getTodayAttendance,
  isHoliday,
  listAttendanceByMonth,
  listHolidays,
  listTodayAttendance,
  listAttendance,
  markAttendanceStatus,
  type AttendanceRow,
  type ActivitySummary,
  type HolidayRow,
} from "../_lib/attendanceSupabase";
import {
  ensureDefaultUsers,
  listActiveUsers,
  type UserRow,
} from "../_lib/usersSupabase";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import toast from "react-hot-toast";
import {
  AnimatedStatNumber,
  AttendancePanelSkeleton,
  HoverCard,
  ShimmerBlock,
  TapButton,
} from "@/app/_components/ui/crm-motion";

const CURRENT_USER_KEY = "crm.current_user_id.v2";

function pickInitialAttendanceUserId(scoped: UserRow[], profileUserId: string): string {
  if (scoped.length === 0) return "";
  try {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(CURRENT_USER_KEY) : null;
    if (stored && scoped.some((u) => u.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  if (profileUserId && scoped.some((u) => u.id === profileUserId)) return profileUserId;
  return scoped[0].id;
}

function dt(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const canViewAll = profile?.role === "admin";
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userOptions, setUserOptions] = useState<UserRow[]>([]);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [memo, setMemo] = useState("");
  const [externalReason, setExternalReason] = useState("");
  const [visitPlace, setVisitPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageFetching, setPageFetching] = useState(false);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [todayActivity, setTodayActivity] = useState<ActivitySummary | null>(null);
  const [activityMap, setActivityMap] = useState<Map<string, ActivitySummary>>(new Map());
  const [month, setMonth] = useState(() => getLocalDateKey().slice(0, 7));
  const [monthRows, setMonthRows] = useState<AttendanceRow[]>([]);
  const [todayRows, setTodayRows] = useState<AttendanceRow[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [isWeekend, setIsWeekend] = useState(false);
  const [isHolidayToday, setIsHolidayToday] = useState(false);
  const [currentPositionLabel, setCurrentPositionLabel] = useState("-");
  const userNameMap = useMemo(
    () => new Map(userOptions.map((u) => [u.id, u.name])),
    [userOptions]
  );

  const todayDate = getLocalDateKey();

  async function readGps(): Promise<{ latitude: number; longitude: number }> {
    if (!("geolocation" in navigator)) {
      throw new Error("이 브라우저는 위치 정보를 지원하지 않습니다.");
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          }),
        () => reject(new Error("GPS 위치를 가져오지 못했습니다.")),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function refresh() {
    if (!currentUserId) return;
    const [t, list, h, act, monthList, todayList, holidayFlag] = await Promise.all([
      getTodayAttendance(currentUserId),
      canViewAll ? listAttendance(300) : Promise.resolve([]),
      listHolidays(),
      getActivitySummaryByUserDate(currentUserId, todayDate),
      canViewAll ? listAttendanceByMonth(month) : Promise.resolve([]),
      canViewAll ? listTodayAttendance() : Promise.resolve([]),
      isHoliday(todayDate),
    ]);
    setToday(t);
    setRows(list);
    setHolidays(h);
    setTodayActivity(act);
    setMonthRows(monthList);
    setTodayRows(todayList);
    setIsHolidayToday(holidayFlag);

    const wk = new Date().getDay();
    setIsWeekend(wk === 0 || wk === 6);

    const m = canViewAll ? await getActivitySummaryMapByDate(todayDate) : new Map();
    setActivityMap(m);
  }

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      try {
        await ensureDefaultUsers();
        const users = await listActiveUsers();
        const scoped =
          profile.role === "staff"
            ? users.filter((u) => u.id === profile.userId)
            : users;
        if (scoped.length > 0) {
          setUserOptions(scoped);
          setCurrentUserId(pickInitialAttendanceUserId(scoped, profile.userId));
        } else if (profile.userId) {
          setUserOptions([]);
          setCurrentUserId(profile.userId);
        }
      } catch {
        setUserOptions([]);
        setCurrentUserId(profile.userId ?? "");
      }
    })();
  }, [profile]);

  useEffect(() => {
    if (!currentUserId) {
      setPageFetching(false);
      return;
    }
    window.localStorage.setItem(CURRENT_USER_KEY, currentUserId);
    let cancelled = false;
    setPageFetching(true);
    void refresh().finally(() => {
      if (!cancelled) setPageFetching(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, month, canViewAll]);

  const statusLabel = useMemo(() => {
    if (!today) {
      if (isWeekend || isHolidayToday) return "휴무";
      return "미출근";
    }
    return today.status;
  }, [today, isHolidayToday, isWeekend]);

  const todayDone = !!today?.check_out;

  const lateList = useMemo(
    () => todayRows.filter((r) => r.checkin_status === "지각"),
    [todayRows]
  );
  const earlyLeaveList = useMemo(
    () => todayRows.filter((r) => r.checkout_status === "조기 퇴근"),
    [todayRows]
  );
  const noRecordList = useMemo(
    () =>
      isWeekend || isHolidayToday
        ? []
        : userOptions
            .filter((u) => !todayRows.some((r) => r.user_id === u.id))
            .map((u) => u.name),
    [todayRows, isWeekend, isHolidayToday, userOptions]
  );

  const monthStats = useMemo(() => {
    const map = new Map<
      string,
      {
        user: string;
        lateCount: number;
        earlyLeaveCount: number;
        holidayWorkCount: number;
        workDays: number;
      }
    >();
    for (const e of userOptions) {
      map.set(e.id, {
        user: e.name,
        lateCount: 0,
        earlyLeaveCount: 0,
        holidayWorkCount: 0,
        workDays: 0,
      });
    }
    for (const r of monthRows) {
      if (!map.has(r.user_id)) continue;
      const row = map.get(r.user_id)!;
      if (r.checkin_status === "지각") row.lateCount += 1;
      if (r.checkout_status === "조기 퇴근") row.earlyLeaveCount += 1;
      if (r.status === "휴무일 근무") row.holidayWorkCount += 1;
      if (r.status !== "휴무" && r.status !== "결근") row.workDays += 1;
    }
    return Array.from(map.values());
  }, [monthRows, userOptions]);

  async function onCheckIn() {
    alert("REAL CHECKIN ENTRY");
    console.log("🔥 REAL CHECKIN ENTRY");
    if (!currentUserId.trim()) {
      toast.error("출근할 직원을 선택해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const pos = await readGps();
      setCurrentPositionLabel(`${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
      await checkIn(currentUserId, pos, { memo: memo || undefined });
      await refresh();
      toast.success("출근 처리되었습니다.");
      const act = await getActivitySummaryByUserDate(currentUserId, todayDate);
      if (!act || act.total === 0) {
        toast("오늘 CRM 활동이 없습니다. 기록을 확인해 주세요.", { icon: "⚠️" });
      }
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "출근 처리 중 오류가 발생했습니다.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onCheckOut() {
    setLoading(true);
    try {
      const pos = await readGps();
      setCurrentPositionLabel(`${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
      await checkOut(currentUserId, pos, memo || undefined);
      await refresh();
      toast.success("퇴근 처리되었습니다.");
      const actOut = await getActivitySummaryByUserDate(currentUserId, todayDate);
      if (!actOut || actOut.total === 0) {
        toast("오늘 CRM 활동 수가 0건입니다. 근태 검증 대상입니다.", { icon: "⚠️" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "퇴근 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function onMark(status: "외근" | "휴가") {
    setLoading(true);
    try {
      const pos = await readGps();
      setCurrentPositionLabel(`${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
      if (status === "외근" && (!externalReason.trim() || !visitPlace.trim())) {
        throw new Error("외근 시 외근 사유와 방문처를 입력해야 합니다.");
      }
      await markAttendanceStatus(currentUserId, status, pos, {
        memo: [visitPlace.trim(), memo.trim()].filter(Boolean).join(" / ") || undefined,
        externalReason: externalReason || undefined,
      });
      await refresh();
      toast.success(status === "외근" ? "외근으로 등록되었습니다." : "휴가로 등록되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "상태 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="crm-card">
      <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">근태 관리</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            GPS + 활동로그 기반으로 근태 신뢰성을 확인합니다.
          </p>
        </div>
        <div className="w-full sm:w-[220px]">
          <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            현재 사용자
          </label>
          <select
            value={currentUserId}
            onChange={(e) => setCurrentUserId(e.target.value)}
            disabled={!canViewAll}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          >
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HoverCard className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">오늘 내 근태 상태</div>
          {pageFetching ? (
            <div className="relative mt-3 min-h-[200px]">
              <AttendancePanelSkeleton />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">오늘 상태</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{statusLabel}</div>
              </HoverCard>
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">출근</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{dt(today?.check_in)}</div>
              </HoverCard>
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">퇴근</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{dt(today?.check_out)}</div>
              </HoverCard>
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">근무일 여부</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {isWeekend || isHolidayToday ? "휴무일" : "근무일"}
                </div>
              </HoverCard>
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">오늘 활동 수</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  <AnimatedStatNumber value={todayActivity?.total ?? 0} />
                  {(todayActivity?.total ?? 0) === 0 ? " (경고)" : ""}
                </div>
              </HoverCard>
              <HoverCard className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">마지막 GPS</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{currentPositionLabel}</div>
              </HoverCard>
            </div>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">메모</label>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 외근 일정, 지각 사유 등"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                외근 사유(외근 시 필수)
              </label>
              <input
                value={externalReason}
                onChange={(e) => setExternalReason(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                방문처(외근 시 필수)
              </label>
              <input
                value={visitPlace}
                onChange={(e) => setVisitPlace(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <TapButton
              onClick={() => void onCheckIn()}
              disabled={loading || pageFetching}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              출근
            </TapButton>
            <TapButton
              onClick={() => void onCheckOut()}
              disabled={
                loading ||
                pageFetching ||
                (!today?.check_in && !today?.check_in_at) ||
                todayDone
              }
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              퇴근
            </TapButton>
            <TapButton
              onClick={() => void onMark("외근")}
              disabled={loading || pageFetching}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/60"
            >
              외근
            </TapButton>
            <TapButton
              onClick={() => void onMark("휴가")}
              disabled={loading || pageFetching}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/60"
            >
              휴가
            </TapButton>
          </div>
        </HoverCard>

        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">자동 판단 기준</div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
            <li>월~금 근무 / 토·일·공휴일 휴무</li>
            <li>09:30 이후 출근 시 자동 `지각`</li>
            <li>월~목 17:45, 금요일 17:30 이전 퇴근 시 `조기 퇴근`</li>
            <li>퇴근은 출근 기록이 있어야 가능</li>
            <li>외근은 사유/방문처/GPS 필수</li>
          </ul>
        </HoverCard>
      </div>

      {canViewAll ? (
      <div className="grid gap-4 lg:grid-cols-3">
        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">오늘 지각자</div>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
            {lateList.length === 0 ? <li>- 없음</li> : lateList.map((r) => <li key={r.id}>{userNameMap.get(r.user_id) ?? r.user_id}</li>)}
          </ul>
        </HoverCard>
        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">오늘 조기퇴근자</div>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
            {earlyLeaveList.length === 0 ? <li>- 없음</li> : earlyLeaveList.map((r) => <li key={r.id}>{userNameMap.get(r.user_id) ?? r.user_id}</li>)}
          </ul>
        </HoverCard>
        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">오늘 무기록자</div>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
            {noRecordList.length === 0 ? <li>- 없음</li> : noRecordList.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </HoverCard>
      </div>
      ) : null}

      {canViewAll ? (
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        {pageFetching ? (
          <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-white/85 p-6 backdrop-blur-[2px] dark:bg-zinc-950/85">
            {Array.from({ length: 5 }).map((_, i) => (
              <ShimmerBlock key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : null}
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
          관리자용 전체 직원 근태 리스트
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">날짜</th>
                <th className="px-4 py-3">출근</th>
                <th className="px-4 py-3">퇴근</th>
                <th className="px-4 py-3">출근판정</th>
                <th className="px-4 py-3">퇴근판정</th>
                <th className="px-4 py-3">휴무</th>
                <th className="px-4 py-3">휴무일근무</th>
                <th className="px-4 py-3">위치기록</th>
                <th className="px-4 py-3">외근</th>
                <th className="px-4 py-3">활동수</th>
                <th className="px-4 py-3">메모</th>
                <th className="px-4 py-3">승인</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-zinc-500">
                    근태 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                      {userNameMap.get(r.user_id) ?? r.user_id}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{r.date}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{dt(r.check_in)}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{dt(r.check_out)}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{r.checkin_status ?? "-"}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{r.checkout_status ?? "-"}</td>
                    <td className="px-4 py-3">{r.is_holiday || r.is_weekend ? "Y" : "-"}</td>
                    <td className="px-4 py-3">{r.status === "휴무일 근무" ? "Y" : "-"}</td>
                    <td className="px-4 py-3">{r.latitude && r.longitude ? "Y" : "-"}</td>
                    <td className="px-4 py-3">{r.status === "외근" ? "Y" : "-"}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                      {activityMap.get(r.user_id)?.total ?? 0}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{r.memo || "-"}</td>
                    <td className="px-4 py-3">
                      {r.status === "휴무일 근무" ? (
                        <TapButton
                          type="button"
                          onClick={async () => {
                            await approveHolidayWork(r.id, !r.holiday_work_approved);
                            await refresh();
                            toast.success(r.holiday_work_approved ? "승인을 취소했습니다." : "휴무일 근무를 승인했습니다.");
                          }}
                          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold dark:border-zinc-700"
                        >
                          {r.holiday_work_approved ? "승인취소" : "승인"}
                        </TapButton>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {canViewAll ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">월별 통계</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2">지각</th>
                  <th className="px-3 py-2">조기퇴근</th>
                  <th className="px-3 py-2">휴무일근무</th>
                  <th className="px-3 py-2">총 근무일</th>
                </tr>
              </thead>
              <tbody>
                {monthStats.map((s) => (
                  <tr key={s.user} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
                    <td className="px-3 py-2 font-semibold">{s.user}</td>
                    <td className="px-3 py-2">
                      <AnimatedStatNumber value={s.lateCount} duration={0.35} />
                    </td>
                    <td className="px-3 py-2">
                      <AnimatedStatNumber value={s.earlyLeaveCount} duration={0.35} />
                    </td>
                    <td className="px-3 py-2">
                      <AnimatedStatNumber value={s.holidayWorkCount} duration={0.35} />
                    </td>
                    <td className="px-3 py-2">
                      <AnimatedStatNumber value={s.workDays} duration={0.35} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HoverCard>

        <HoverCard className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">공휴일 관리</div>
          <div className="mt-3 flex gap-2">
            <input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              value={newHolidayName}
              onChange={(e) => setNewHolidayName(e.target.value)}
              placeholder="공휴일명"
              className="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <TapButton
              type="button"
              onClick={async () => {
                if (!newHolidayDate || !newHolidayName.trim()) return;
                await addHoliday(newHolidayDate, newHolidayName.trim());
                setNewHolidayDate("");
                setNewHolidayName("");
                await refresh();
                toast.success("공휴일이 추가되었습니다.");
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-semibold text-white"
            >
              추가
            </TapButton>
          </div>
          <ul className="mt-3 max-h-60 space-y-1 overflow-auto text-sm">
            {holidays.map((h) => (
              <li key={h.date} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <span>
                  {h.date} · {h.name}
                </span>
                <TapButton
                  type="button"
                  onClick={async () => {
                    await deleteHoliday(h.date);
                    await refresh();
                    toast.success("공휴일을 삭제했습니다.");
                  }}
                  className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                >
                  삭제
                </TapButton>
              </li>
            ))}
          </ul>
        </HoverCard>
      </div>
      ) : null}
      </div>
    </div>
  );
}

