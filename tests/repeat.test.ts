import { strict as assert } from "node:assert";
import test from "node:test";
import { repeatOfRecent, titleSimilarity } from "@/lib/news/repeat";

const recent = [{ briefingDate: "2026-10-20", title: "정부, 우크라이나 공관원 일부 철수 결정", whatHappened: "…", urls: ["https://www.yna.co.kr/view/AKR1"] }];
const source = (url: string, title = "기사") => ({ url, title });

test("최근에 실은 사건과 제목이 거의 같은 후보는 반복으로 본다", () => {
  assert.ok(titleSimilarity("정부, 우크라이나 공관원 일부 철수 결정", "한국, 우크라이나 주재 공관원 일부 철수 결정") >= 0.6);
  assert.equal(repeatOfRecent({ title: "한국, 우크라이나 주재 공관원 일부 철수 결정", category: "geopolitics", sources: [source("https://www.donga.com/1", "[속보]외교부, 우크라 공관원 일부 철수")] }, recent), recent[0].title);
  // 다른 사건은 통과한다
  assert.equal(repeatOfRecent({ title: "호주, 16세 미만 SNS 금지법 위반으로 메타 등 제소", category: "politics", sources: [source("https://www.donga.com/2")] }, recent), null);
});

test("같은 기사 URL을 출처로 쓰면 반복이다. 지표 기사는 제목이 비슷해도 URL만 본다", () => {
  assert.equal(repeatOfRecent({ title: "전혀 다른 제목", category: "society", sources: [source("https://m.yna.co.kr/view/AKR1?utm_source=rss")] }, recent), recent[0].title);
  const kospi = [{ briefingDate: "2026-10-20", title: "코스피 3%대 급락", whatHappened: "…", urls: ["https://www.yna.co.kr/view/K1"] }];
  assert.equal(repeatOfRecent({ title: "코스피 3%대 급락", category: "stocks", sources: [source("https://www.yna.co.kr/view/K2")] }, kospi), null);
  assert.equal(repeatOfRecent({ title: "코스피 3%대 급락", category: "stocks", sources: [source("https://www.yna.co.kr/view/K1")] }, kospi), kospi[0].title);
});
