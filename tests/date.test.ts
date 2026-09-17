import { strict as assert } from "node:assert";
import test from "node:test";
import { getTodayKST, isFreshSource } from "@/lib/date";

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
