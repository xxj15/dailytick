import { strict as assert } from "node:assert";
import test from "node:test";
import { BriefingValidationError, generateDailyBriefing, generateTechSection, type GenerateBriefingDependencies, type GenerateBriefingParams } from "@/lib/openai/generate-briefing";
import { buildGroundingReviewPrompt, reviewViolations } from "@/lib/news/review";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { CANDIDATE, CONCEPT, DATE, DRAFT, QUOTE } from "./fixtures/news";

const params: GenerateBriefingParams = { date: DATE, concepts: [CONCEPT], mode: "new", candidates: [CANDIDATE], learnedTitles: [] };
const passed = { news: [{ rank: 1, supported: true, reason: "선택한 원문과 일치" }], framing: { supported: true, reason: "일반 금융 해설" } };
const dependencies: GenerateBriefingDependencies = {
  write: async () => ({ draft: DRAFT, inputTokens: 10, outputTokens: 5 }),
  review: async () => ({ review: passed, inputTokens: 20, outputTokens: 5 }),
};

test("검증된 사실로 조합한 한 건만 발행하고 검토 사용량을 합산한다", async () => {
  const result = await generateDailyBriefing(params, dependencies);
  assert.equal(result.content.newsItems[0].whatHappened, QUOTE);
  assert.equal(result.content.newsItems.length, 1);
  assert.equal(result.inputTokens, 30);
  assert.equal(result.reviews.length, 1);
});

test("근거 없는 표결 숫자는 AI 의미 검토 전에 차단한다", async () => {
  let reviewed = false;
  await assert.rejects(() => generateDailyBriefing(params, {
    write: async () => ({ draft: { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], whyImportant: "표결은 7대0이었다." }] }, inputTokens: 10, outputTokens: 5 }),
    review: async () => { reviewed = true; return dependencies.review(dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE]))), [CANDIDATE], DATE); },
  }), (error: unknown) => error instanceof BriefingValidationError && error.violations.every((item) => item.code === "news.unsupported_number") && error.usage.inputTokens === 20);
  assert.equal(reviewed, false);
});

test("전년 실적을 올해 실적으로 설명하면 의미 검토에서 거절하고 재시도도 실패하면 중단한다", async () => {
  const past = "기업은 전년 실적에 대해 매출 증가가 나타났다고 설명했다. 이 내용은 올해 발표한 회고 자료다.";
  const candidate = { ...CANDIDATE, facts: [{ ...CANDIDATE.facts[0], quote: past }], documents: [{ ...CANDIDATE.documents[0], text: past }] };
  await assert.rejects(() => generateDailyBriefing({ ...params, candidates: [candidate] }, {
    ...dependencies,
    write: async () => ({ draft: { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], title: "올해 실적 증가" }] }, inputTokens: 10, outputTokens: 5 }),
    review: async (content, candidates, date) => {
      assert.match(buildGroundingReviewPrompt(content, candidates, date), /전년 실적/);
      return { review: { ...passed, news: [{ rank: 1, supported: false, reason: "전년 실적을 올해 실적으로 바꿈" }] }, inputTokens: 20, outputTokens: 5 };
    },
  }), (error: unknown) => error instanceof BriefingValidationError && error.reviews.length === 2 && error.violations[0].code === "news.unsupported");
});

test("재시도로 통과해도 최초 근거 검토 위반을 남긴다", async () => {
  let count = 0;
  const result = await generateDailyBriefing(params, {
    ...dependencies,
    review: async () => ({ review: ++count === 1 ? { ...passed, framing: { supported: false, reason: "한 줄에 미확인 시장 반응을 추가함" } } : passed, inputTokens: 20, outputTokens: 5 }),
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.violations[0].code, "briefing.unsupported");
  assert.equal(result.reviews.length, 2);
});

test("검토 누락·중복·장애를 통과로 취급하지 않는다", async () => {
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  assert.equal(reviewViolations(content, { ...passed, news: [] })[0].code, "news.review_coverage");
  assert.equal(reviewViolations(content, { ...passed, news: [...passed.news, ...passed.news] })[0].code, "news.review_coverage");
  await assert.rejects(() => generateDailyBriefing(params, { ...dependencies, review: async () => { throw new Error("검토 API 장애"); } }), (error: unknown) => error instanceof BriefingValidationError && error.violations[0].code === "news.review_unavailable");
});

test("근거 없는 후보는 생성 API를 호출하지 않는다", async () => {
  let called = false;
  await assert.rejects(() => generateDailyBriefing({ ...params, candidates: [] }, {
    ...dependencies, write: async () => { called = true; throw new Error("호출하면 안 됨"); },
  }), /근거가 확보된 뉴스/);
  assert.equal(called, false);
});

test("테크 상식은 뉴스 없이 상식만 쓰고, 아티클이면 원문을 검토 단계에 함께 넘긴다", async () => {
  const draft = { knowledgeItems: DRAFT.knowledgeItems };
  // 개념형: 뉴스 후보가 없어도 생성된다
  const concept = await generateTechSection({ ...params, candidates: [] }, { ...dependencies, write: async () => ({ draft, inputTokens: 1, outputTokens: 1 }) });
  assert.equal(concept.content.newsItems.length, 0);
  assert.ok(!("todayKeywords" in concept.content));

  // 아티클형: 원문(후보)이 검토 단계로 넘어가고, 검토가 요약을 거절하면 발행하지 않는다
  let reviewed: unknown[] = [];
  await assert.rejects(() => generateTechSection(params, {
    write: async () => ({ draft, inputTokens: 1, outputTokens: 1 }),
    review: async (_content, candidates) => { reviewed = candidates; return { review: { news: [], framing: { supported: false, reason: "원문에 없는 수치" } }, inputTokens: 1, outputTokens: 1 }; },
  }), BriefingValidationError);
  assert.equal(reviewed.length, 1);
});

test("마지막 시도에서 특정 뉴스만 검토에 걸리면 그 뉴스만 빼고 발행한다", async () => {
  const second = { ...CANDIDATE, id: "c2", title: "두 번째", facts: [{ ...CANDIDATE.facts[0], id: "c2-f1" }] };
  const twoNews = { ...DRAFT, newsItems: [DRAFT.newsItems[0], { ...DRAFT.newsItems[0], rank: 2, candidateId: "c2", factIds: ["c2-f1"], title: "두 번째 뉴스" }] };
  const result = await generateDailyBriefing({ ...params, candidates: [CANDIDATE, second] }, {
    write: async () => ({ draft: twoNews, inputTokens: 1, outputTokens: 1 }),
    review: async () => ({ review: { news: [{ rank: 1, supported: true, reason: "일치" }, { rank: 2, supported: false, reason: "지역 오류" }], framing: passed.framing }, inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.content.newsItems.map((item) => item.title), ["기준금리 동결"]);
  assert.ok(result.violations.some((item) => item.code === "news.unsupported"));
});

test("키워드·한 줄 검토가 걸리거나 남는 뉴스가 없으면 빼서 발행하지 않는다", async () => {
  await assert.rejects(() => generateDailyBriefing(params, {
    ...dependencies,
    review: async () => ({ review: { news: [{ rank: 1, supported: false, reason: "근거 없음" }], framing: passed.framing }, inputTokens: 1, outputTokens: 1 }),
  }), BriefingValidationError);
  await assert.rejects(() => generateDailyBriefing(params, {
    ...dependencies,
    review: async () => ({ review: { ...passed, framing: { supported: false, reason: "한 줄 과장" } }, inputTokens: 1, outputTokens: 1 }),
  }), BriefingValidationError);
});

test("실제 기사 제목에 있는 숫자(버전 등)는 근거로 인정하고, 어디에도 없는 숫자는 막는다", async () => {
  const titled = { ...CANDIDATE, documents: [{ ...CANDIDATE.documents[0], source: { ...CANDIDATE.documents[0].source, title: "Next.js 16 출시" } }] };
  titled.sources = titled.documents.map((doc) => doc.source);
  const write = (title: string) => async () => ({ draft: { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], title }] }, inputTokens: 1, outputTokens: 1 });
  const ok = await generateDailyBriefing({ ...params, candidates: [titled] }, { ...dependencies, write: write("Next.js 16 출시") });
  assert.equal(ok.content.newsItems[0].title, "Next.js 16 출시");
  await assert.rejects(() => generateDailyBriefing({ ...params, candidates: [titled] }, { ...dependencies, write: write("Next.js 17 출시") }),
    (error: unknown) => error instanceof BriefingValidationError && error.violations.some((item) => item.code === "news.unsupported_number"));
});
