import { strict as assert } from "node:assert";
import test from "node:test";
import { BriefingValidationError, generateDailyBriefing, type GenerateBriefingDependencies, type GenerateBriefingParams } from "@/lib/openai/generate-briefing";
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
