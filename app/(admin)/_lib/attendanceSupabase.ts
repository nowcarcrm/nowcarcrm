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
  /** 레거시/혼합 스키마: 일부 DB는 work_date 만 사용 */
  date?: string | null;
  work_date?: string | null;
  check_in: string | null;
  check_in_at?: string | null;
  check_out: string | null;
  check_out_at?: string | null;
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
  /** crm_activity_logs 미존재·캐시 오류 등으로 집계를 못 했을 때; total=0이어도 ‘활동 없음’으로 해석하지 말 것 */
  activityLogsUnavailable?: true;
};

const EMPTY_ACTIVITY_SUMMARY: ActivitySummary = {
  consultations: 0,
  leadCreated: 0,
  statusChanged: 0,
  contractProgress: 0,
  total: 0,
};

/** crm_activity_logs 미생성·스키마 캐시 미반영 등으로 조회 불가일 때 throw 대신 빈 요약 사용 */
function isCrmActivityLogsUnavailable(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  const m = (e.message ?? "").toLowerCase();
  if (e.code === "PGRST205") return true;
  if (!m.includes("crm_activity_logs")) return false;
  return (
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

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

function isMeaningfulTimestampValue(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (s.length === 0) return false;
  const low = s.toLowerCase();
  if (low === "null" || low === "undefined") return false;
  return true;
}

/** UI·표시용: work_date/date, check_in·check_in_at, check_out·check_out_at 혼합 스키마 정규화 */
export type NormalizedAttendanceRow = AttendanceRow & {
  normalized_date: string | null;
  normalized_check_in: string | null;
  normalized_check_out: string | null;
};

export function normalizeAttendanceRow(
  row: AttendanceRow | null | undefined
): NormalizedAttendanceRow | null {
  if (!row) return null;
  const dateRaw = row.work_date ?? row.date ?? null;
  const normalized_date =
    dateRaw != null && String(dateRaw).trim() !== ""
      ? String(dateRaw).trim()
      : null;

  let normalized_check_in: string | null = null;
  if (isMeaningfulTimestampValue(row.check_in)) {
    normalized_check_in = String(row.check_in).trim();
  } else if (isMeaningfulTimestampValue(row.check_in_at)) {
    normalized_check_in = String(row.check_in_at).trim();
  }

  let normalized_check_out: string | null = null;
  if (isMeaningfulTimestampValue(row.check_out)) {
    normalized_check_out = String(row.check_out).trim();
  } else if (isMeaningfulTimestampValue(row.check_out_at)) {
    normalized_check_out = String(row.check_out_at).trim();
  }

  return {
    ...row,
    normalized_date,
    normalized_check_in,
    normalized_check_out,
  };
}

/**
 * 실제 출근시각만 본다: 1) check_in 의미 있음 → 그 값, 2) 아니면 check_in_at 의미 있음 → 그 값, 3) 둘 다 없으면 null.
 * (row 존재 여부와 무관 — 빈 껍데 row는 null)
 */
function getExistingCheckInTimestamp(
  todayRow: AttendanceRow | null | undefined
): string | null {
  if (!todayRow) return null;
  if (isMeaningfulTimestampValue(todayRow.check_in)) {
    return String(todayRow.check_in).trim();
  }
  if (isMeaningfulTimestampValue(todayRow.check_in_at)) {
    return String(todayRow.check_in_at).trim();
  }
  return null;
}

/** 퇴근 등: 의미 있는 출근 시각이 있는지 (check_in → check_in_at) */
function rowHasCheckIn(row: AttendanceRow | null | undefined): boolean {
  return getExistingCheckInTimestamp(row) != null;
}

function isUndefinedColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e.code === "42703") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
}

function extractUnknownColumnFromPostgrest(error: unknown): string | null {
  const msg = (error as { message?: string }).message ?? "";
  const m = msg.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  return m?.[1] ?? null;
}

function isOnConflictTargetMismatch(error: unknown): boolean {
  const m = ((error as { message?: string }).message ?? "").toLowerCase();
  return (
    m.includes("no unique or exclusion constraint matching") ||
    m.includes("there is no unique or exclusion constraint matching")
  );
}

async function updateAttendanceByIdStrippingUnknown(
  rowId: string,
  patch: Record<string, unknown>
): Promise<{ data: AttendanceRow | null; error: unknown }> {
  let body: Record<string, unknown> = { ...patch };
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data, error } = await supabase
      .from("attendance")
      .update(body)
      .eq("id", rowId)
      .select("*")
      .maybeSingle();
    if (!error) {
      return { data: (data as AttendanceRow | null) ?? null, error: null };
    }
    const col = extractUnknownColumnFromPostgrest(error);
    if (!col || !(col in body)) {
      return { data: null, error };
    }
    const next = { ...body };
    delete next[col];
    body = next;
  }
  return { data: null, error: new Error("attendance update: 반복 실패(알 수 없는 컬럼)") };
}

async function upsertNewDayAttendanceStrippingUnknown(
  userId: string,
  today: string,
  patch: Record<string, unknown>
): Promise<{ data: AttendanceRow | null; error: unknown }> {
  const strategies: Array<{ onConflict: string; base: Record<string, unknown> }> = [
    {
      onConflict: "user_id,work_date",
      base: { user_id: userId, work_date: today, date: today },
    },
    {
      onConflict: "user_id,date",
      base: { user_id: userId, date: today, work_date: today },
    },
  ];

  for (const { onConflict, base } of strategies) {
    const required = new Set(onConflict.split(",").map((s) => s.trim()));
    let body: Record<string, unknown> = { ...base, ...patch };

    for (let attempt = 0; attempt < 24; attempt++) {
      const { data, error } = await supabase
        .from("attendance")
        .upsert(body, { onConflict })
        .select("*")
        .maybeSingle();

      if (!error) {
        return { data: (data as AttendanceRow | null) ?? null, error: null };
      }

      if (isOnConflictTargetMismatch(error)) {
        break;
      }

      const col = extractUnknownColumnFromPostgrest(error);
      if (col && col in body && !required.has(col)) {
        const next = { ...body };
        delete next[col];
        body = next;
        continue;
      }

      break;
    }
  }

  return { data: null, error: new Error("attendance upsert: 스키마/유니크 제약에 맞는 저장에 실패했습니다.") };
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

  {
    const r = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("work_date", today)
      .maybeSingle();
    if (r.error) {
      if (!isUndefinedColumnError(r.error)) throw r.error;
    } else if (r.data) {
      return r.data as AttendanceRow;
    }
  }

  {
    const r = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (r.error) {
      if (isUndefinedColumnError(r.error)) return null;
      throw r.error;
    }
    return (r.data as AttendanceRow | null) ?? null;
  }
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
  if (userId == null || userId === "") {
    throw new Error("직원 ID가 없습니다. 다시 로그인하거나 사용자를 선택하세요.");
  }

  const now = new Date();
  const today = getLocalDateKey(now);
  const todayRow = await getTodayAttendance(userId, today);

  const existingCheckIn = getExistingCheckInTimestamp(todayRow);

  if (existingCheckIn !== null) {
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

  const checkInStamp = getLocalDateTimeISO(now);
  const payload: Record<string, unknown> = {
    check_in: checkInStamp,
    check_in_at: checkInStamp,
    status: baseStatus,
    latitude: position.latitude,
    longitude: position.longitude,
    external_reason: opts?.externalReason ?? null,
    memo: opts?.memo ?? null,
    is_holiday: meta.is_holiday,
    is_weekend: meta.is_weekend,
    checkin_status: checkinStatus,
  };

  const todayRowId = todayRow?.id != null ? String(todayRow.id) : "";
  if (todayRowId.length > 0) {
    const { data, error } = await updateAttendanceByIdStrippingUnknown(todayRowId, payload);
    if (error) {
      const e = error as { code?: string; message?: string; details?: string; hint?: string };
      console.error("[attendance] checkIn update failed:", {
        code: e.code ?? null,
        message: e.message ?? null,
        details: e.details ?? null,
        hint: e.hint ?? null,
        raw: error,
      });
      throw new Error(
        formatPostgrestError({
          message: typeof e.message === "string" ? e.message : "출근 처리에 실패했습니다.",
          details: e.details,
          hint: e.hint,
          code: e.code,
        })
      );
    }
    if (!data) {
      throw new Error("출근 처리 후 행을 확인하지 못했습니다.");
    }
    return data;
  }

  const { data, error } = await upsertNewDayAttendanceStrippingUnknown(userId, today, payload);
  if (error) {
    const e = error as { code?: string; message?: string; details?: string; hint?: string };
    console.error("[attendance] checkIn upsert failed:", {
      code: e.code ?? null,
      message: e.message ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
      raw: error,
    });
    throw new Error(
      formatPostgrestError({
        message:
          typeof e.message === "string" ? e.message : String(error ?? "출근 처리에 실패했습니다."),
        details: e.details,
        hint: e.hint,
        code: e.code,
      })
    );
  }
  if (!data) {
    throw new Error("출근 처리 후 행을 확인하지 못했습니다.");
  }
  return data;
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
  const rowId = current.id != null ? String(current.id) : "";
  if (!rowId) {
    throw new Error("출근 행 식별자가 없어 퇴근 처리할 수 없습니다.");
  }

  const outPatch: Record<string, unknown> = {
    check_out: checkOutStamp,
    check_out_at: checkOutStamp,
    memo: memo ?? null,
    latitude: position.latitude,
    longitude: position.longitude,
    status: nextStatus,
    checkout_status: checkoutStatus,
  };

  const { data, error } = await updateAttendanceByIdStrippingUnknown(rowId, outPatch);
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

export async function listAttendance(limit = 200, userIds?: string[]): Promise<AttendanceRow[]> {
  /** date만 정렬하면 date가 null인 work_date 행이 limit 밖으로 밀릴 수 있어 created_at 기준으로 통일 */
  let query = supabase
    .from("attendance")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
  }
  const { data, error } = await query;
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
  month: string, // yyyy-mm
  userIds?: string[]
): Promise<AttendanceRow[]> {
  const from = `${month}-01`;
  const last = lastDayOfCalendarMonth(month);
  const to = `${month}-${String(last).padStart(2, "0")}`;

  let byDateQuery = supabase
    .from("attendance")
    .select("*")
    .gte("date", from)
    .lte("date", to);
  if (userIds && userIds.length > 0) byDateQuery = byDateQuery.in("user_id", userIds);
  const byDate = await byDateQuery;
  if (byDate.error && !isUndefinedColumnError(byDate.error)) throw byDate.error;

  let byWorkQuery = supabase
    .from("attendance")
    .select("*")
    .gte("work_date", from)
    .lte("work_date", to);
  if (userIds && userIds.length > 0) byWorkQuery = byWorkQuery.in("user_id", userIds);
  const byWork = await byWorkQuery;
  if (byWork.error && !isUndefinedColumnError(byWork.error)) throw byWork.error;

  const map = new Map<string, AttendanceRow>();
  if (!byDate.error) {
    for (const r of (byDate.data as AttendanceRow[]) ?? []) {
      map.set(r.id, r);
    }
  }
  if (!byWork.error) {
    for (const r of (byWork.data as AttendanceRow[]) ?? []) {
      map.set(r.id, r);
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const na = normalizeAttendanceRow(a)?.normalized_date ?? "";
    const nb = normalizeAttendanceRow(b)?.normalized_date ?? "";
    if (na !== nb) return na.localeCompare(nb);
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
  return merged;
}

export async function listTodayAttendance(): Promise<AttendanceRow[]> {
  const today = getLocalDateKey();
  const map = new Map<string, AttendanceRow>();

  const byWork = await supabase.from("attendance").select("*").eq("work_date", today);
  if (byWork.error && !isUndefinedColumnError(byWork.error)) throw byWork.error;
  if (!byWork.error) {
    for (const r of (byWork.data as AttendanceRow[]) ?? []) map.set(r.id, r);
  }

  const byDate = await supabase.from("attendance").select("*").eq("date", today);
  if (byDate.error && !isUndefinedColumnError(byDate.error)) throw byDate.error;
  if (!byDate.error) {
    for (const r of (byDate.data as AttendanceRow[]) ?? []) map.set(r.id, r);
  }

  return Array.from(map.values());
}

export async function listTodayAttendanceByUserIds(userIds: string[]): Promise<AttendanceRow[]> {
  if (!userIds.length) return [];
  const today = getLocalDateKey();
  const map = new Map<string, AttendanceRow>();

  const byWork = await supabase
    .from("attendance")
    .select("*")
    .eq("work_date", today)
    .in("user_id", userIds);
  if (byWork.error && !isUndefinedColumnError(byWork.error)) throw byWork.error;
  if (!byWork.error) {
    for (const r of (byWork.data as AttendanceRow[]) ?? []) map.set(r.id, r);
  }

  const byDate = await supabase
    .from("attendance")
    .select("*")
    .eq("date", today)
    .in("user_id", userIds);
  if (byDate.error && !isUndefinedColumnError(byDate.error)) throw byDate.error;
  if (!byDate.error) {
    for (const r of (byDate.data as AttendanceRow[]) ?? []) map.set(r.id, r);
  }

  return Array.from(map.values());
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
  if (error) {
    if (isCrmActivityLogsUnavailable(error)) {
      console.warn("[attendance] crm_activity_logs unavailable, zero summary:", error);
      return { ...EMPTY_ACTIVITY_SUMMARY, activityLogsUnavailable: true };
    }
    throw error;
  }
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

export async function getActivitySummaryMapByDate(date: string, userIds?: string[]) {
  let q = supabase.from("crm_activity_logs").select("user_id, activity_type").eq("date", date);
  if (userIds && userIds.length > 0) {
    q = q.in("user_id", userIds);
  }
  const { data, error } = await q;
  if (error) {
    if (isCrmActivityLogsUnavailable(error)) {
      console.warn("[attendance] crm_activity_logs unavailable, empty map:", error);
      return new Map<string, ActivitySummary>();
    }
    throw error;
  }
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

