import { devLog } from "@/app/_lib/devLog";
import { supabase } from "./supabaseClient";
import { DEFAULT_HOLIDAYS } from "./holidayConfig";

export type AttendanceStatus =
  | "정상 출근"
  | "지각"
  | "외근"
  | "휴가"
  | "결근"
  | "조기 퇴근"
  | "휴무"
  | "휴무일 근무";

export type AttendanceRow = {
  id: string;
  user_id: string;
  date: string; // yyyy-mm-dd
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  latitude: number | null;
  longitude: number | null;
  external_reason: string | null;
  memo: string | null;
  is_holiday: boolean;
  is_weekend: boolean;
  holiday_work_approved: boolean;
  checkin_status: "정상 출근" | "지각" | null;
  checkout_status: "정상 퇴근" | "조기 퇴근" | null;
  created_at: string;
};

export type HolidayRow = {
  date: string;
  name: string;
  created_at: string;
};

export type ActivitySummary = {
  consultations: number;
  leadCreated: number;
  statusChanged: number;
  contractProgress: number;
  total: number;
};

/** 로컬 달력 기준 YYYY-MM-DD (UTC toISOString().slice(0,10) 사용 금지) */
export function getLocalDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 로컬 시각 기준 타임스탬프 문자열(오프셋 포함). DB timestamptz 저장용 · toISOString() 미사용 */
function getLocalDateTimeISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}:${s}.${ms}${sign}${oh}:${om}`;
}

function rowHasCheckIn(row: AttendanceRow | null | undefined): boolean {
  const v = row?.check_in;
  if (v == null) return false;
  return String(v).trim().length > 0;
}

function isWeekend(dateIso: string) {
  const d = new Date(`${dateIso}T09:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function getCheckInStatus(at: Date): "정상 출근" | "지각" {
  const d = new Date(at.getTime());
  const threshold = new Date(at.getTime());
  threshold.setHours(9, 30, 0, 0);
  return d.getTime() <= threshold.getTime() ? "정상 출근" : "지각";
}

function getCheckOutStatus(at: Date): "정상 퇴근" | "조기 퇴근" {
  const d = new Date(at.getTime());
  const threshold = new Date(at.getTime());
  const weekday = d.getDay();
  // Fri: 17:30, Mon-Thu: 17:45
  if (weekday === 5) {
    threshold.setHours(17, 30, 0, 0);
  } else {
    threshold.setHours(17, 45, 0, 0);
  }
  return d.getTime() >= threshold.getTime() ? "정상 퇴근" : "조기 퇴근";
}

async function ensureDefaultHolidays() {
  const { count, error } = await supabase
    .from("holidays")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return;
  const { error: insertError } = await supabase
    .from("holidays")
    .insert(DEFAULT_HOLIDAYS);
  if (insertError) throw insertError;
}

export async function listHolidays(): Promise<HolidayRow[]> {
  await ensureDefaultHolidays();
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data as HolidayRow[]) ?? [];
}

export async function addHoliday(date: string, name: string) {
  const { error } = await supabase
    .from("holidays")
    .upsert({ date, name }, { onConflict: "date" });
  if (error) throw error;
}

export async function deleteHoliday(date: string) {
  const { error } = await supabase.from("holidays").delete().eq("date", date);
  if (error) throw error;
}

export async function isHoliday(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("holidays")
    .select("date")
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function dayMeta(date: string) {
  const weekend = isWeekend(date);
  const holiday = await isHoliday(date);
  return { is_weekend: weekend, is_holiday: holiday };
}

export async function getTodayAttendance(
  userId: string,
  dateKeyParam?: string
): Promise<AttendanceRow | null> {
  const today = dateKeyParam ?? getLocalDateKey();
  devLog("today dateKey:", today);
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();
  if (error) throw error;
  return (data as AttendanceRow | null) ?? null;
}

function formatPostgrestError(error: {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}): string {
  const parts = [error.message, error.details, error.hint].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  return parts.join(" — ");
}

export async function checkIn(
  userId: string,
  position: { latitude: number; longitude: number },
  opts?: { memo?: string; externalReason?: string; asExternal?: boolean }
) {
  if (!position) {
    throw new Error("GPS 위치 정보가 없어 출근 처리할 수 없습니다.");
  }
  if (!userId?.trim()) {
    throw new Error("직원 ID가 없습니다. 다시 로그인하거나 사용자를 선택하세요.");
  }

  const now = new Date();
  const today = getLocalDateKey(now);
  const existing = await getTodayAttendance(userId, today);
  if (rowHasCheckIn(existing)) {
    throw new Error("오늘 이미 출근 기록이 있습니다.");
  }

  const meta = await dayMeta(today);

  const checkinStatus = getCheckInStatus(now);
  const weekendOrHoliday = meta.is_weekend || meta.is_holiday;
  const asExternal = !!opts?.asExternal;
  const baseStatus: AttendanceStatus = asExternal
    ? "외근"
    : weekendOrHoliday
      ? "휴무일 근무"
      : checkinStatus;

  const user = { id: userId };
  const checkInStamp = getLocalDateTimeISO(now);
  const payload = {
    user_id: userId,
    date: today,
    check_in: checkInStamp,
    status: baseStatus,
    latitude: position.latitude,
    longitude: position.longitude,
    external_reason: opts?.externalReason ?? null,
    memo: opts?.memo ?? null,
    is_holiday: meta.is_holiday,
    is_weekend: meta.is_weekend,
    checkin_status: checkinStatus,
  };

  devLog("user:", user);
  devLog("payload:", payload);

  const { data, error } = await supabase
    .from("attendance")
    .upsert(payload, { onConflict: "user_id,date" })
    .select("*")
    .single();

  if (error) {
    console.error("[attendance] checkIn upsert failed:", error);
    throw new Error(formatPostgrestError(error));
  }
  return data as AttendanceRow;
}

export async function checkOut(
  userId: string,
  position: { latitude: number; longitude: number },
  memo?: string
) {
  if (!position) {
    throw new Error("GPS 위치 정보가 없어 퇴근 처리할 수 없습니다.");
  }
  const now = new Date();
  const today = getLocalDateKey(now);
  const current: AttendanceRow | null = await getTodayAttendance(userId, today);
  if (!current) {
    throw new Error("오늘 출근 기록이 없습니다.");
  }
  if (!rowHasCheckIn(current)) {
    throw new Error("출근 후 퇴근 처리가 가능합니다.");
  }

  const checkoutStatus = getCheckOutStatus(now);
  const nextStatus: AttendanceStatus =
    current.status === "휴무일 근무"
      ? "휴무일 근무"
      : checkoutStatus === "조기 퇴근"
        ? "조기 퇴근"
        : current.checkin_status === "지각"
          ? "지각"
          : current.status === "외근"
            ? "외근"
            : "정상 출근";

  const checkOutStamp = getLocalDateTimeISO(now);
  const { data, error } = await supabase
    .from("attendance")
    .update({
      check_out: checkOutStamp,
      memo: memo ?? null,
      latitude: position.latitude,
      longitude: position.longitude,
      status: nextStatus,
      checkout_status: checkoutStatus,
    })
    .eq("user_id", userId)
    .eq("date", today)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as AttendanceRow | null) ?? null;
}

export async function markAttendanceStatus(
  userId: string,
  status: Exclude<AttendanceStatus, "정상 출근" | "지각" | "조기 퇴근">,
  position: { latitude: number; longitude: number } | null,
  payload?: { memo?: string; externalReason?: string }
) {
  const today = getLocalDateKey();
  const meta = await dayMeta(today);
  const lat = position?.latitude ?? null;
  const lng = position?.longitude ?? null;
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      {
        user_id: userId,
        date: today,
        status,
        memo: payload?.memo ?? null,
        external_reason: payload?.externalReason ?? null,
        latitude: lat,
        longitude: lng,
        is_holiday: meta.is_holiday,
        is_weekend: meta.is_weekend,
      },
      { onConflict: "user_id,date" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as AttendanceRow;
}

export async function listAttendance(limit = 200): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AttendanceRow[]) ?? [];
}

function lastDayOfCalendarMonth(month: string): number {
  const [ys, ms] = month.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31;
  return new Date(y, m, 0).getDate();
}

export async function listAttendanceByMonth(
  month: string // yyyy-mm
): Promise<AttendanceRow[]> {
  const from = `${month}-01`;
  const last = lastDayOfCalendarMonth(month);
  const to = `${month}-${String(last).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data as AttendanceRow[]) ?? [];
}

export async function listTodayAttendance(): Promise<AttendanceRow[]> {
  const today = getLocalDateKey();
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("date", today);
  if (error) throw error;
  return (data as AttendanceRow[]) ?? [];
}

export async function approveHolidayWork(attendanceId: string, approved: boolean) {
  const { error } = await supabase
    .from("attendance")
    .update({ holiday_work_approved: approved })
    .eq("id", attendanceId);
  if (error) throw error;
}

export async function getActivitySummaryByUserDate(
  userId: string,
  date: string
): Promise<ActivitySummary> {
  const { data, error } = await supabase
    .from("crm_activity_logs")
    .select("activity_type")
    .eq("user_id", userId)
    .eq("date", date);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ activity_type: string }>;
  const consultations = rows.filter((r) => r.activity_type === "consultation_created").length;
  const leadCreated = rows.filter((r) => r.activity_type === "lead_created").length;
  const statusChanged = rows.filter((r) => r.activity_type === "status_changed").length;
  const contractProgress = rows.filter((r) => r.activity_type === "contract_progress").length;
  return {
    consultations,
    leadCreated,
    statusChanged,
    contractProgress,
    total: consultations + leadCreated + statusChanged + contractProgress,
  };
}

export async function getActivitySummaryMapByDate(date: string) {
  const { data, error } = await supabase
    .from("crm_activity_logs")
    .select("user_id, activity_type")
    .eq("date", date);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ user_id: string; activity_type: string }>;
  const map = new Map<string, ActivitySummary>();
  for (const r of rows) {
    if (!map.has(r.user_id)) {
      map.set(r.user_id, {
        consultations: 0,
        leadCreated: 0,
        statusChanged: 0,
        contractProgress: 0,
        total: 0,
      });
    }
    const item = map.get(r.user_id)!;
    if (r.activity_type === "consultation_created") item.consultations += 1;
    if (r.activity_type === "lead_created") item.leadCreated += 1;
    if (r.activity_type === "status_changed") item.statusChanged += 1;
    if (r.activity_type === "contract_progress") item.contractProgress += 1;
    item.total += 1;
  }
  return map;
}

