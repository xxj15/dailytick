import { strict as assert } from "node:assert";
import test from "node:test";
import { formatKstDateTime, getTodayKST, isFreshSource, isStaleEvent } from "@/lib/date";

/**
 * 서버는 대부분 UTC로 돈다. 날짜가 하루 어긋나면
 * 오늘 지면이 어제 날짜로 저장되고 멱등성도 함께 깨진다. (명세 §28)
 */
test("KST 날짜는 서버 timezone과 무관하게 계산된다", () => {
  // UTC 15:00 = KST 다음 날 00:00
  assert.equal(getTodayKST(new Date("2026-09-16T15:00:00Z")), "2026-09-17");
  assert.equal(getTodayKST(new Date("2026-09-16T14:59:59Z")), "2026-09-16");

  // 발행 시각(08:30 KST) 전후
  assert.equal(getTodayKST(new Date("2026-09-16T23:30:00Z")), "2026-09-17");
});

test("게시 시각이 없거나 읽히지 않으면 최신으로 보지 않는다", () => {
  assert.equal(isFreshSource(undefined, "2026-09-17"), false);
  assert.equal(isFreshSource("어제", "2026-09-17"), false);
  assert.equal(isFreshSource("", "2026-09-17"), false);
});

test("최신 출처의 허용 범위는 기준일 자정 기준 -72시간 ~ +24시간", () => {
  const date = "2026-09-17";

  assert.equal(isFreshSource("2026-09-17T08:00:00+09:00", date), true);
  assert.equal(isFreshSource("2026-09-16", date), true);

  // 경계 안쪽 / 바깥쪽
  assert.equal(isFreshSource("2026-09-14T00:00:00+09:00", date), true);
  assert.equal(isFreshSource("2026-09-13T23:59:59+09:00", date), false);

  // 아직 오지 않은 시각에 보도된 기사는 존재할 수 없다
  assert.equal(isFreshSource("2026-09-18T09:00:00+09:00", date), false);
});

test("월요일 지면은 금요일 장 마감 뒤 보도를 근거로 쓸 수 있다", () => {
  // 2026-09-21(월) 지면 · 2026-09-18(금) 18시 보도
  assert.equal(isFreshSource("2026-09-18T18:00:00+09:00", "2026-09-21"), true);
});

test("파트별 발행 하한선을 넘기면 그 기준으로 판정한다", () => {
  const date = "2026-10-17";
  assert.equal(isFreshSource("2026-10-12T09:00:00+09:00", date), false);
  assert.equal(isFreshSource("2026-10-12T09:00:00+09:00", date, 168), true);
  assert.equal(isFreshSource("2026-10-09T23:59:59+09:00", date, 168), false);
});

test("신선도 검사의 경계: 기준일 자정 72시간 전부터 기준일 23:59:59까지 받는다", () => {
  const date = "2026-10-19";
  assert.equal(isFreshSource("2026-10-16T00:00:00+09:00", date), true);
  assert.equal(isFreshSource("2026-10-15T23:59:59+09:00", date), false);
  assert.equal(isFreshSource("2026-10-19T23:59:59+09:00", date), true);
  assert.equal(isFreshSource("2026-10-20T00:00:00+09:00", date), false);
});

test("핵심 사건 발생일: 기준일 이틀 전까지 받고, 월요일 지면은 금요일 사건까지 받는다", () => {
  // 2026-10-22는 목요일이다
  assert.equal(isStaleEvent("2026-10-22", "2026-10-22"), false);
  assert.equal(isStaleEvent("2026-10-20", "2026-10-22"), false);
  // 사흘 전 사건을 오늘 게시된 기사로 다시 정리했어도 지난 일이다
  assert.equal(isStaleEvent("2026-10-19", "2026-10-22"), true);
  assert.equal(isStaleEvent("2026-10-15", "2026-10-22"), true);
  // 2026-10-26은 월요일이다. 금요일(10-23) 사건까지 받는다
  assert.equal(isStaleEvent("2026-10-23", "2026-10-26"), false);
  assert.equal(isStaleEvent("2026-10-22", "2026-10-26"), true);
  // 앞으로의 날짜(시행 예정일 등)나 읽을 수 없는 값으로 기사를 버리지 않는다
  assert.equal(isStaleEvent("2026-12-01", "2026-10-22"), false);
  assert.equal(isStaleEvent("어제", "2026-10-22"), false);
});

test("근거 선택 프롬프트에 넘기는 게시 시각은 KST로 적는다", () => {
  assert.equal(formatKstDateTime("2026-10-21T23:07:45.000Z"), "2026-10-22 08:07");
  assert.equal(formatKstDateTime("2026-10-22T08:07:00+09:00"), "2026-10-22 08:07");
  assert.equal(formatKstDateTime(undefined), null);
  assert.equal(formatKstDateTime("시각 없음"), null);
});
