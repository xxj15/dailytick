import {
  FIRST_ISSUE_DATE,
  SOURCE_MAX_AGE_HOURS,
  PUBLISH_HOUR_KST,
  PUBLISH_MINUTE_KST,
  SERVICE_TIMEZONE,
} from "@/config/app";

/**
 * 날짜 유틸.
 *
 * 서버의 기본 timezone(대부분 UTC)을 절대 신뢰하지 않는다.
 * `new Date().toISOString().slice(0, 10)` 은 한국 날짜와 어긋날 수 있으므로 사용하지 않는다.
 */

/** 'YYYY-MM-DD' 형태의 서비스 날짜 문자열. */
export type DateString = string;

export const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HOUR_MS = 3_600_000;

export function isDateString(value: string): value is DateString {
  return DATE_STRING_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** KST 기준 날짜/시각 구성요소. */
function kstParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl은 자정을 '24'로 표기할 수 있다.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** KST 기준 오늘 날짜. 예: '2026-08-25' */
export function getTodayKST(date: Date = new Date()): DateString {
  const { year, month, day } = kstParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** KST 기준 현재 시각이 오늘 발행 시각(08:30) 이전인가. */
export function isBeforePublishTimeKST(date: Date = new Date()): boolean {
  const { hour, minute } = kstParts(date);
  return hour * 60 + minute < PUBLISH_HOUR_KST * 60 + PUBLISH_MINUTE_KST;
}

/** '08:30' 형태의 발행 예정 시각. */
export function getPublishTimeLabel(): string {
  return `${pad(PUBLISH_HOUR_KST)}:${pad(PUBLISH_MINUTE_KST)}`;
}

/** 두 날짜 사이의 일수 차이 (to - from). */
function diffDays(from: DateString, to: DateString): number {
  const toUtc = (value: DateString) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** 창간일 기준 발행 호수. 예: 'NO. 001' */
function getIssueNumber(date: DateString): number {
  return Math.max(1, diffDays(FIRST_ISSUE_DATE, date) + 1);
}

export function formatIssueNumber(date: DateString): string {
  return `NO. ${String(getIssueNumber(date)).padStart(3, "0")}`;
}

/** 예: '2026년 8월 25일 화요일' */
export function formatKoreanDate(date: DateString): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Archive 리스트용. 예: 'AUGUST 2026' */
export function formatMonthLabel(date: DateString): string {
  const [y, m] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  })
    .format(new Date(Date.UTC(y, m - 1, 1)))
    .toUpperCase();
}

/** timestamptz → KST 시각 표기. 예: '08:32 KST' */
export function formatKstTime(isoTimestamp: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: SERVICE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoTimestamp));

  return `${time} KST`;
}

/** 'YYYY-MM-DD' KST 자정의 UTC epoch(ms). KST는 서머타임이 없어 고정 +9다. */
function kstMidnightMs(date: DateString): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * HOUR_MS;
}

/**
 * 기준일 지면이 받는 출처 게시 시각 범위(UTC epoch ms). 기준일 자정 기준 -maxAgeHours 이상, +24시간 미만이다.
 * 서버 검사(isFreshSource)와 수집 프롬프트의 안내(freshSourceWindowKST)가 이 계산 하나를 같이 쓴다.
 */
function freshSourceBounds(date: DateString, maxAgeHours: number) {
  const midnight = kstMidnightMs(date);
  return { from: midnight - maxAgeHours * HOUR_MS, until: midnight + 24 * HOUR_MS };
}

/**
 * 출처 게시 시각이 기준일 지면에 쓸 만큼 최신인가. (명세 §12)
 *
 * 허용 범위는 기준일 자정 기준 -SOURCE_MAX_AGE_HOURS ~ +24시간이다.
 * 위를 막는 이유는 아직 오지 않은 시각에 보도된 기사가 있을 수 없기 때문이다.
 * 시각이 없거나 파싱되지 않으면 최신이라고 보지 않는다. 확인할 수 없는 값이다.
 */
export function isFreshSource(
  publishedAt: string | undefined,
  date: DateString,
  maxAgeHours: number = SOURCE_MAX_AGE_HOURS,
): boolean {
  if (!publishedAt) return false;

  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return false;

  const { from, until } = freshSourceBounds(date, maxAgeHours);
  return published >= from && published < until;
}

/**
 * isFreshSource가 통과시키는 게시 시각 범위를 KST로 적는다. 수집 프롬프트가 서버와 다른 범위를 말하지 않게 한다.
 * 예: 기준일 '2026-10-19' → { from: '2026-10-16 00:00', to: '2026-10-19 23:59' }
 * 위쪽 경계는 포함하지 않으므로(다음 날 00:00 미만) 표기는 그 1분 전이다.
 */
export function freshSourceWindowKST(
  date: DateString,
  maxAgeHours: number = SOURCE_MAX_AGE_HOURS,
): { from: string; to: string } {
  const { from, until } = freshSourceBounds(date, maxAgeHours);
  return { from: formatKstMinute(from), to: formatKstMinute(until - 60_000) };
}

/** UTC epoch(ms) → KST 'YYYY-MM-DD HH:mm'. KST는 서머타임이 없어 고정 +9다. */
function formatKstMinute(epochMs: number): string {
  const kst = new Date(epochMs + 9 * HOUR_MS);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/**
 * 출처 게시 시각 표기. 예: '2026.08.25'
 * AI가 넘긴 값이라 형식이 깨져 있을 수 있으므로 파싱 실패 시 null.
 */
export function formatSourceDate(isoTimestamp?: string): string | null {
  if (!isoTimestamp) return null;

  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(parsed)
    .replaceAll("-", ".");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
