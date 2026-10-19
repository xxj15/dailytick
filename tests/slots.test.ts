import { strict as assert } from "node:assert";
import test from "node:test";
import { emptySlots, fitsSlot, matchSlots, slotMismatch } from "@/lib/news/slots";
import type { NewsCategory, NewsRegion } from "@/types/briefing";

const item = (title: string, region: NewsRegion, category: NewsCategory, importance = 5) => ({ title, region, category, importance });

test("국내 정세 슬롯은 국내 정치·정책·외교·안보·경제·금융·기업만 받는다", () => {
  for (const category of ["politics", "policy", "geopolitics", "rates", "stocks", "fx", "macro", "industry", "commodities"] as const) {
    assert.equal(fitsSlot("domestic", item("국내", "KR", category)), true, category);
  }
  // 사회·과학·국제 일반·기타와 IT 분류는 국내라도 들어가지 않는다
  for (const category of ["society", "science", "world", "other", "ai", "semiconductor"] as const) {
    assert.equal(fitsSlot("domestic", item("국내", "KR", category)), false, category);
  }
  // 해외 사건은 분류가 맞아도 들어가지 않는다
  assert.equal(fitsSlot("domestic", item("해외", "GLOBAL", "policy")), false);
  // 재시도 프롬프트에 들어가는 이유에 고칠 방법이 있다
  assert.match(slotMismatch("domestic", item("국내", "KR", "society")) ?? "", /society.*정치·정책·외교·안보·경제·금융·기업/);
});

test("오늘의 화제는 분야와 지역을 가리지 않고, IT 슬롯은 IT 분류만 받는다", () => {
  assert.equal(fitsSlot("top", item("사회", "KR", "society")), true);
  assert.equal(fitsSlot("top", item("국제", "GLOBAL", "world")), true);
  assert.equal(fitsSlot("it", item("반도체", "KR", "semiconductor")), true);
  assert.equal(fitsSlot("it", item("AI", "GLOBAL", "ai")), true);
  assert.equal(fitsSlot("it", item("과학", "GLOBAL", "science")), false);
});

test("슬롯을 채울 때 국내·IT를 먼저 채우고, 화제는 남은 후보 가운데 가장 중요한 것으로 채운다", () => {
  const rates = item("금리", "KR", "rates", 9);
  const ai = item("AI", "GLOBAL", "ai", 8);
  const war = item("분쟁", "GLOBAL", "world", 7);
  const matched = matchSlots([war, ai, rates]);
  // 중요도만 보면 금리가 화제를 차지해 국내가 빈다. 국내를 먼저 채워야 세 슬롯이 다 찬다.
  assert.equal(matched.domestic, rates);
  assert.equal(matched.it, ai);
  assert.equal(matched.top, war);
  assert.deepEqual(emptySlots([war, ai, rates]), []);
});

test("한 후보는 한 슬롯만 채운다. 국내·IT에 쓴 후보로 화제를 채우지 않는다", () => {
  const rates = item("금리", "KR", "rates", 9);
  const ai = item("AI", "GLOBAL", "ai", 8);
  assert.deepEqual(emptySlots([rates, ai]), ["top"]);
  assert.deepEqual(emptySlots([rates]), ["top", "it"]);
  // 같은 슬롯 후보가 둘이면 중요도가 높은 쪽이 그 슬롯, 남은 쪽이 화제다
  const policy = item("정책", "KR", "policy", 6);
  const matched = matchSlots([policy, rates]);
  assert.equal(matched.domestic, rates);
  assert.equal(matched.top, policy);
  assert.deepEqual(emptySlots([]), ["top", "domestic", "it"]);
});

test("국내 사회 사건뿐이면 화제는 채우지만 국내 정세는 빈다", () => {
  assert.deepEqual(emptySlots([item("사회", "KR", "society", 9), item("AI", "GLOBAL", "ai")]), ["domestic"]);
  assert.deepEqual(emptySlots([item("외교", "KR", "geopolitics", 9), item("AI", "GLOBAL", "ai")]), ["top"]);
});
