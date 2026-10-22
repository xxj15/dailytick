import { strict as assert } from "node:assert";
import test from "node:test";
import { collectMarketNews } from "@/lib/openai/collect-news";
import { mergeSameEvent, newDevelopment, repeatOfRecent, titleSimilarity } from "@/lib/news/repeat";
import type { FeedItem } from "@/lib/news/rss";

const recent = [{ briefingDate: "2026-10-20", title: "정부, 우크라이나 공관원 일부 철수 결정", whatHappened: "…", urls: ["https://www.yna.co.kr/view/AKR1"] }];
const source = (url: string, title = "기사") => ({ url, title });

test("최근에 실은 사건과 제목이 거의 같은 후보는 반복으로 본다", () => {
  assert.ok(titleSimilarity("정부, 우크라이나 공관원 일부 철수 결정", "한국, 우크라이나 주재 공관원 일부 철수 결정") >= 0.6);
  assert.deepEqual(repeatOfRecent({ title: "한국, 우크라이나 주재 공관원 일부 철수 결정", category: "geopolitics", sources: [source("https://www.donga.com/1", "[속보]외교부, 우크라 공관원 일부 철수")] }, recent), { title: recent[0].title });
  // 다른 사건은 통과한다
  assert.equal(repeatOfRecent({ title: "호주, 16세 미만 SNS 금지법 위반으로 메타 등 제소", category: "politics", sources: [source("https://www.donga.com/2")] }, recent), null);
});

test("같은 기사 URL을 출처로 쓰면 반복이다. 지표 기사는 제목이 비슷해도 URL만 본다", () => {
  assert.deepEqual(repeatOfRecent({ title: "전혀 다른 제목", category: "society", sources: [source("https://m.yna.co.kr/view/AKR1?utm_source=rss")] }, recent), { title: recent[0].title });
  const kospi = [{ briefingDate: "2026-10-20", title: "코스피 3%대 급락", whatHappened: "…", urls: ["https://www.yna.co.kr/view/K1"] }];
  assert.equal(repeatOfRecent({ title: "코스피 3%대 급락", category: "stocks", sources: [source("https://www.yna.co.kr/view/K2")] }, kospi), null);
  assert.deepEqual(repeatOfRecent({ title: "코스피 3%대 급락", category: "stocks", sources: [source("https://www.yna.co.kr/view/K1")] }, kospi), { title: kospi[0].title });
});

test("지면 제목을 다시 썼어도 원 기사 제목끼리 같으면 같은 사건이다 (언론사·제목이 달라도)", () => {
  const houthi = [{
    briefingDate: "2026-10-22", title: "미국, 후티 공격 강화에 사우디 공무원·가족 출국 명령", whatHappened: "…", urls: ["https://www.donga.com/news/1"],
    sourceTitles: ["美, 사우디 주재 직원·가족 철수 명령...후티 위협에 경계 강화"],
  }];
  const candidate = { title: "미 국무부, 사우디 주재 직원·가족 철수 명령", category: "geopolitics" as const, sources: [source("https://www.yna.co.kr/view/H2", "미 국무부, 사우디 주재 직원·가족 철수 명령")] };
  // 다시 쓴 지면 제목과는 거리가 멀다
  assert.ok(titleSimilarity(candidate.title, houthi[0].title) < 0.6);
  assert.deepEqual(repeatOfRecent(candidate, houthi), { title: houthi[0].title });
});

test("제목이 비슷해도 새 전개(확정·시행·새 수치)가 보이면 거르지 않고 후속 후보로 남긴다", () => {
  const plan = [{ briefingDate: "2026-10-18", title: "정부, 상장사 정보보호 공시 의무화 추진", whatHappened: "정부가 상장사 정보보호 공시 의무화를 추진한다.", urls: ["https://www.yna.co.kr/view/P1"] }];
  assert.deepEqual(
    repeatOfRecent({ title: "정부, 상장사 정보보호 공시 의무화 확정", category: "security", sources: [source("https://www.yna.co.kr/view/P2", "상장사 정보보호 공시 의무화 확정")] }, plan),
    { title: plan[0].title, followUp: "확정" },
  );
  const housing = [{ briefingDate: "2026-10-22", title: "서울 아파트 실거래가, 1년 새 15.5% 상승", whatHappened: "8월 서울 아파트 실거래가가 전년 동월 대비 15.50% 올랐다.", urls: ["https://www.yna.co.kr/view/S1"] }];
  assert.deepEqual(
    repeatOfRecent({ title: "서울 아파트 실거래가 1년 새 16.2% 상승", category: "industry", sources: [source("https://www.yna.co.kr/view/S2")] }, housing),
    { title: housing[0].title, followUp: "16.2" },
  );
  // 같은 수치를 다시 전하면 새 전개가 아니다
  assert.deepEqual(
    repeatOfRecent({ title: "서울 아파트 실거래가 1년 새 15.5% 올라", category: "industry", sources: [source("https://www.mk.co.kr/news/S3")] }, housing),
    { title: housing[0].title },
  );
});

test("날짜·기사 판 번호는 새 수치로 보지 않는다", () => {
  assert.equal(newDevelopment(["2026년 10월 21일 정부 발표 (종합2보)"], ["20일 정부"]), null);
  assert.equal(newDevelopment(["원·달러 환율 1,450원 돌파"], ["원·달러 환율 1,420원"]), "1,450");
});

test("같은 날 후보끼리 같은 사건이면 점수가 높은 것 하나만 남기고, 남긴 후보는 원래 순서를 지킨다", () => {
  const candidate = (title: string, importance: number, sourceTitle = title) => ({ title, importance, sources: [{ title: sourceTitle }] });
  const kakaoIt = candidate("카카오, 상업용 비전 인코더 2종 오픈소스 공개", 8.3);
  const kakaoEconomy = candidate("카카오 AI 모델 공개", 7.1, "카카오, 'AI의 눈' 비전 인코더 2종 오픈소스로 공개");
  const other = candidate("한은, 기준금리 동결", 8.0);
  const { kept, merged } = mergeSameEvent([kakaoEconomy, other, kakaoIt]);
  assert.deepEqual(kept.map((entry) => entry.title), [other.title, kakaoIt.title]);
  assert.deepEqual(merged, [{ title: kakaoEconomy.title, kept: kakaoIt.title }]);
  // 같은 분야 숫자만 비슷한 다른 회사 실적은 합치지 않는다
  assert.equal(mergeSameEvent([candidate("삼성전자 3분기 영업이익 12조", 8), candidate("SK하이닉스 3분기 영업이익 10조", 7)]).kept.length, 2);
});

test("수집은 반복 후보를 빼고, 후속 후보는 남기고, 같은 날 같은 사건 후보는 합친 뒤 각각 로그에 남긴다", async () => {
  const at = "2026-10-21T23:00:00.000Z";
  const items: FeedItem[] = [
    { id: "n1", publisher: "연합뉴스", section: "종합", title: "외교부, 우크라 공관원 일부 철수 결정", url: "https://www.yna.co.kr/view/R1", publishedAt: at },
    { id: "n2", publisher: "연합뉴스", section: "IT", title: "상장사 정보보호 공시 의무화 확정", url: "https://www.yna.co.kr/view/F1", publishedAt: at },
    { id: "n3", publisher: "전자신문", section: "IT", title: "카카오, 'AI의 눈' 비전 인코더 2종 오픈소스로 공개", url: "https://www.etnews.com/K1", publishedAt: at },
    { id: "n4", publisher: "매일경제", section: "경제", title: "카카오, 비전 인코더 2종 오픈소스 공개", url: "https://www.mk.co.kr/news/K2", publishedAt: at },
  ];
  const pick = (itemIds: string[], title: string, category: string, value: number) =>
    ({ itemIds, title, summary: "요약", region: "KR", category, scores: { value, timeliness: 9, impact: 8, novelty: 8 }, reason: "이유" });
  const result = await collectMarketNews("2026-10-22", undefined, {
    recentNews: [
      ...recent,
      { briefingDate: "2026-10-18", title: "정부, 상장사 정보보호 공시 의무화 추진", whatHappened: "…", urls: ["https://www.yna.co.kr/view/P1"], sourceTitles: ["상장사 정보보호 공시 의무화 추진"] },
    ],
  }, {
    feeds: async () => ({ items, feeds: [] }),
    select: async () => ({ picks: { candidates: [
      pick(["n1"], "한국, 우크라이나 공관원 일부 철수 결정", "geopolitics", 8),
      pick(["n2"], "상장사 정보보호 공시 의무화 확정", "security", 8),
      pick(["n3"], "카카오, 비전 인코더 2종 오픈소스 공개", "ai", 9),
      pick(["n4"], "카카오, 비전 인코더 공개", "industry", 7),
    ], rejected: [] }, inputTokens: 1, outputTokens: 1 }),
  });
  assert.deepEqual(result.candidates.map((candidate) => candidate.title), ["상장사 정보보호 공시 의무화 확정", "카카오, 비전 인코더 2종 오픈소스 공개"]);
  assert.deepEqual(result.selection.repeats, [{ title: "한국, 우크라이나 공관원 일부 철수 결정", recent: recent[0].title }]);
  assert.deepEqual(result.selection.followUps, [{ title: "상장사 정보보호 공시 의무화 확정", recent: "정부, 상장사 정보보호 공시 의무화 추진", development: "확정" }]);
  assert.deepEqual(result.selection.merged, [{ title: "카카오, 비전 인코더 공개", kept: "카카오, 비전 인코더 2종 오픈소스 공개" }]);
});
