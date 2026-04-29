/**
 * KST(Asia/Seoul) 시간 포맷 공통 헬퍼.
 * - 서버(SSR, UTC)와 브라우저(클라이언트 TZ)에서 동일 결과를 보장.
 * - native Intl.DateTimeFormat 사용 (의존성 0).
 */

type FormatMode = "date" | "datetime" | "time";

type KstParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function toDate(input: Date | string | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const s = String(input).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getKstParts(d: Date): KstParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatKst(
  input: Date | string | null | undefined,
  mode: FormatMode = "datetime"
): string {
  const d = toDate(input);
  if (!d) return "";
  const { year, month, day, hour, minute } = getKstParts(d);
  if (mode === "date") return `${year}-${month}-${day}`;
  if (mode === "time") return `${hour}:${minute}`;
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** 입력의 KST 날짜만 'YYYY-MM-DD'. 빈/잘못된 입력 → "" */
export function kstYmd(input: Date | string | null | undefined): string {
  return formatKst(input, "date");
}

/** 오늘의 KST 날짜 'YYYY-MM-DD' */
export function todayYmdKst(): string {
  return formatKst(new Date(), "date");
}
