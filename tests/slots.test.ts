import { strict as assert } from "node:assert";
import test from "node:test";
import { emptySlots, fitsSlot, matchSlots, slotMismatch, slotOrder } from "@/lib/news/slots";
import type { NewsCategory, NewsRegion } from "@/types/briefing";

const item = (title: string, region: NewsRegion, category: NewsCategory, importance = 5) => ({ title, region, category, importance });

test("경제 슬롯은 증시·금리·환율·경기·산업·기업·원자재·경제정책만 받고, 국내·해외를 가리지 않는다", () => {
  for (const category of ["rates", "stocks", "fx", "macro", "industry", "commodities", "policy"] as const) {
    assert.equal(fitsSlot("economy", item("국내", "KR", category)), true, category);
    assert.equal(fitsSlot("economy", item("해외", "GLOBAL", category)), true, category);
  }
  // 정치·외교·사회·과학·국제 일반·기타와 IT 분류는 들어가지 않는다
  for (const category of ["politics", "geopolitics", "society", "science", "world", "other", "ai", "semiconductor"] as const) {
    assert.equal(fitsSlot("economy", item("국내", "KR", category)), false, category);
  }
  // 재시도 프롬프트에 들어가는 이유에 고칠 방법이 있다
  assert.match(slotMismatch("economy", item("국내", "KR", "politics")) ?? "", /politics.*증시·금리·환율·경기·산업·기업·경제정책/);
});

test("오늘의 화제는 분야와 지역을 가리지 않고, IT 슬롯은 IT 분류만 받는다", () => {
  assert.equal(fitsSlot("top", item("사회", "KR", "society")), true);
  assert.equal(fitsSlot("top", item("국제", "GLOBAL", "world")), true);
  assert.equal(fitsSlot("it", item("반도체", "KR", "semiconductor")), true);
  assert.equal(fitsSlot("it", item("AI", "GLOBAL", "ai")), true);
  assert.equal(fitsSlot("it", item("과학", "GLOBAL", "science")), false);
  // IT 기업의 실적은 industry로 매기므로 경제 슬롯이다
  assert.equal(fitsSlot("it", item("파두 실적", "KR", "industry")), false);
});

test("슬롯을 채울 때 경제·IT를 먼저 채우고, 화제는 남은 후보 가운데 가장 중요한 것으로 채운다", () => {
  const rates = item("금리", "KR", "rates", 9);
  const ai = item("AI", "GLOBAL", "ai", 8);
  const war = item("분쟁", "GLOBAL", "world", 7);
  const matched = matchSlots([war, ai, rates]);
  // 중요도만 보면 금리가 화제를 차지해 경제가 빈다. 경제를 먼저 채워야 세 슬롯이 다 찬다.
  assert.equal(matched.economy, rates);
  assert.equal(matched.it, ai);
  assert.equal(matched.top, war);
  assert.deepEqual(emptySlots([war, ai, rates]), []);
});

test("한 후보는 한 슬롯만 채운다. 경제·IT에 쓴 후보로 화제를 채우지 않는다", () => {
  const rates = item("금리", "KR", "rates", 9);
  const ai = item("AI", "GLOBAL", "ai", 8);
  assert.deepEqual(emptySlots([rates, ai]), ["top"]);
  assert.deepEqual(emptySlots([rates]), ["top", "it"]);
  // 같은 슬롯 후보가 둘이면 중요도가 높은 쪽이 그 슬롯, 남은 쪽이 화제다
  const policy = item("정책", "KR", "policy", 6);
  const matched = matchSlots([policy, rates]);
  assert.equal(matched.economy, rates);
  assert.equal(matched.top, policy);
  assert.deepEqual(emptySlots([]), ["top", "economy", "it"]);
});

test("정치·사회 사건뿐이면 화제는 채우지만 경제는 빈다", () => {
  assert.deepEqual(emptySlots([item("사회", "KR", "society", 9), item("AI", "GLOBAL", "ai")]), ["economy"]);
  assert.deepEqual(emptySlots([item("외교", "KR", "geopolitics", 9), item("AI", "GLOBAL", "ai")]), ["economy"]);
  assert.deepEqual(emptySlots([item("미국 증시", "GLOBAL", "stocks", 9), item("AI", "GLOBAL", "ai")]), ["top"]);
});

test("예전 국내 정세 슬롯은 규칙을 다시 보지 않고 지금 경제 자리에 놓인다", () => {
  assert.equal(slotMismatch("domestic", item("외교", "KR", "geopolitics")), null);
  assert.equal(slotOrder("domestic"), slotOrder("economy"));
  assert.ok(slotOrder("top") < slotOrder("domestic") && slotOrder("domestic") < slotOrder("it"));
});
