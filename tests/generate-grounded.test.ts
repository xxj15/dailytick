import { strict as assert } from "node:assert";
import test from "node:test";
import { BriefingValidationError, generateDailyBriefing, generateTechSection, type GenerateBriefingDependencies, type GenerateBriefingParams } from "@/lib/openai/generate-briefing";
import { buildGroundingReviewPrompt, reviewViolations } from "@/lib/news/review";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { CANDIDATE, CONCEPT, DATE, DOMESTIC, DRAFT, IT, QUOTE, candidate, draftNews } from "./fixtures/news";

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
  const twoNews = { ...DRAFT, newsItems: [DRAFT.newsItems[0], { ...DRAFT.newsItems[0], rank: 2, slot: "domestic" as const, candidateId: "c2", factIds: ["c2-f1"], title: "두 번째 뉴스" }] };
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

test("마지막 시도에서 숫자 검증에 걸린 뉴스만 빼고, 나머지는 검토를 거쳐 발행한다", async () => {
  const second = { ...CANDIDATE, id: "c2", title: "두 번째", facts: [{ ...CANDIDATE.facts[0], id: "c2-f1" }] };
  const twoNews = { ...DRAFT, newsItems: [DRAFT.newsItems[0], { ...DRAFT.newsItems[0], rank: 2, slot: "domestic" as const, candidateId: "c2", factIds: ["c2-f1"], title: "두 번째 뉴스", whyImportant: "근거에 없는 77%가 있다." }] };
  let reviewedTitles: string[] = [];
  const result = await generateDailyBriefing({ ...params, candidates: [CANDIDATE, second] }, {
    write: async () => ({ draft: twoNews, inputTokens: 1, outputTokens: 1 }),
    review: async (content) => { reviewedTitles = content.newsItems.map((item) => item.title); return { review: { news: content.newsItems.map((item) => ({ rank: item.rank, supported: true, reason: "일치" })), framing: passed.framing }, inputTokens: 1, outputTokens: 1 }; },
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(reviewedTitles, ["기준금리 동결"]);
  assert.deepEqual(result.content.newsItems.map((item) => item.title), ["기준금리 동결"]);
});

test("두 번 모두 키워드·한 줄(framing)만 걸리면 그 부분만 고칠 세 번째 기회를 준다", async () => {
  let reviews = 0;
  let lastPrompt = "";
  const result = await generateDailyBriefing(params, {
    write: async (input) => { lastPrompt = input; return { draft: DRAFT, inputTokens: 1, outputTokens: 1 }; },
    review: async () => ({ review: ++reviews < 3 ? { ...passed, framing: { supported: false, reason: "키워드가 뉴스에 없음" } } : passed, inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(result.attempts, 3);
  assert.match(lastPrompt, /이 부분을 고치고/);
});

test("두 번째 시도에서 뉴스 한 건과 framing이 함께 걸리면, 그 뉴스는 빼고 framing만 고칠 기회를 준다", async () => {
  const second = { ...CANDIDATE, id: "c2", title: "두 번째", facts: [{ ...CANDIDATE.facts[0], id: "c2-f1" }] };
  const twoNews = { ...DRAFT, newsItems: [DRAFT.newsItems[0], { ...DRAFT.newsItems[0], rank: 2, slot: "domestic" as const, candidateId: "c2", factIds: ["c2-f1"], title: "두 번째 뉴스" }] };
  let reviews = 0;
  let lastPrompt = "";
  const result = await generateDailyBriefing({ ...params, candidates: [CANDIDATE, second] }, {
    write: async (input) => { lastPrompt = input; return { draft: reviews >= 2 ? { ...DRAFT, newsItems: [DRAFT.newsItems[0]] } : twoNews, inputTokens: 1, outputTokens: 1 }; },
    review: async (content) => (++reviews < 3
      ? { review: { news: content.newsItems.map((item) => ({ rank: item.rank, supported: item.rank === 1, reason: item.rank === 1 ? "일치" : "최근 뉴스 반복" })), framing: { supported: false, reason: "예정된 일을 현재처럼 씀" } }, inputTokens: 1, outputTokens: 1 }
      : { review: { news: content.newsItems.map((item) => ({ rank: item.rank, supported: true, reason: "일치" })), framing: passed.framing }, inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(result.attempts, 3);
  assert.match(lastPrompt, /이번에는 싣지 않는다/);
  assert.deepEqual(result.content.newsItems.map((item) => item.title), ["기준금리 동결"]);
});

/* ------------------------------------------------------------------
 * 세 슬롯(오늘의 화제·국내·IT)
 * ------------------------------------------------------------------ */

const slotParams: GenerateBriefingParams = { ...params, candidates: [CANDIDATE, DOMESTIC, IT] };
const passAll: GenerateBriefingDependencies["review"] = async (content) => ({
  review: { news: content.newsItems.map((item) => ({ rank: item.rank, supported: true, reason: "일치" })), framing: passed.framing }, inputTokens: 1, outputTokens: 1,
});
/** 시도마다 다른 초안을 돌려준다. 마지막 초안은 그 뒤에도 계속 쓴다. */
function drafts(...newsPerAttempt: ReturnType<typeof draftNews>[][]): { write: GenerateBriefingDependencies["write"]; prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    write: async (input) => {
      prompts.push(input);
      return { draft: { ...DRAFT, newsItems: newsPerAttempt[Math.min(prompts.length, newsPerAttempt.length) - 1] }, inputTokens: 1, outputTokens: 1 };
    },
  };
}

test("정상: 세 슬롯을 채우면 화제 → 국내 → IT 순서로 rank 1~3을 매기고 slot을 저장한다", async () => {
  const { write } = drafts([draftNews(3, "it", "c3", { region: "GLOBAL" }), draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]);
  const result = await generateDailyBriefing(slotParams, { write, review: passAll });
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.content.newsItems.map((item) => [item.rank, item.slot, item.evidence?.candidateId]), [[1, "top", "c1"], [2, "domestic", "c2"], [3, "it", "c3"]]);
});

test("작성 프롬프트에 슬롯별로 들어갈 수 있는 후보를 알려 주고, 맞는 후보가 없는 슬롯은 비우라고 한다", async () => {
  const { write, prompts } = drafts([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]);
  await generateDailyBriefing({ ...params, candidates: [CANDIDATE, DOMESTIC] }, { write, review: passAll });
  assert.match(prompts[0], /domestic\(국내 정세\): c1, c2/);
  assert.match(prompts[0], /it\(IT\): 맞는 후보 없음/);
});

test("작성 프롬프트는 서버의 빈 슬롯 판정처럼 국내·IT를 먼저 배정하고, 하나뿐인 국내·IT 후보는 화제에 쓰지 않게 한다", async () => {
  // A(국내 금리)·B(해외 AI)·C(국제 분쟁): 국내·IT 후보가 하나씩뿐이다. A를 화제에 쓰면 국내가 빈다.
  const world = candidate("c4", { region: "GLOBAL", category: "world", importance: 7 });
  const { write, prompts } = drafts([draftNews(1, "top", "c4"), draftNews(2, "domestic", "c1"), draftNews(3, "it", "c3", { region: "GLOBAL" })]);
  await generateDailyBriefing({ ...params, candidates: [CANDIDATE, IT, world] }, { write, review: passAll });
  const prompt = prompts[0];
  assert.match(prompt, /배정 순서: domestic과 it을 먼저 정하고, top은 남은 후보에서 고른다/);
  assert.match(prompt, /domestic·it에 맞는 후보가 하나뿐이면 그 후보는 그 슬롯에 쓰고 top에 쓰지 않는다/);
  assert.match(prompt, /- top\(오늘의 화제\): c4\n/);
  assert.match(prompt, /- domestic\(국내 정세\): c1 \(이 슬롯에 맞는 후보는 이것뿐이다/);
  assert.match(prompt, /- it\(IT\): c3 \(이 슬롯에 맞는 후보는 이것뿐이다/);
  // 후보 JSON의 slots에서도 top이 빠진다
  assert.match(prompt, /"id": "c1",[\s\S]*?"slots": \[\s*"domestic"\s*\]/);
  // 국내·IT 후보만 하나씩 있으면 화제는 비운다 (matchSlots와 같다)
  const pair = drafts([draftNews(1, "domestic", "c1"), draftNews(2, "it", "c3", { region: "GLOBAL" })]);
  await generateDailyBriefing({ ...params, candidates: [CANDIDATE, IT] }, { write: pair.write, review: passAll });
  assert.match(pair.prompts[0], /- top\(오늘의 화제\): 맞는 후보 없음/);
  // 국내 후보가 둘이면 어느 쪽이든 화제에 쓸 수 있다
  const two = drafts([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]);
  await generateDailyBriefing({ ...params, candidates: [CANDIDATE, DOMESTIC] }, { write: two.write, review: passAll });
  assert.match(two.prompts[0], /- top\(오늘의 화제\): c1, c2\n/);
});

test("화제가 국내 사건일 때 국내 슬롯에 같은 사건을 쓰면 재시도로 다른 국내 사건으로 고친다", async () => {
  const { write, prompts } = drafts(
    [draftNews(1, "top", "c1"), draftNews(2, "domestic", "c1")],
    [draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")],
  );
  const result = await generateDailyBriefing(slotParams, { write, review: passAll });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.violations.map((item) => [item.code, item.rank]), [["news.same_event", 2]]);
  assert.match(prompts[1], /같은 후보\(c1\)/);
  assert.deepEqual(result.content.newsItems.map((item) => item.evidence?.candidateId), ["c1", "c2"]);
});

test("슬롯 중복: it을 두 번 쓰면 발행 전에 걸리고 재시도한다", async () => {
  const otherIt = candidate("c4", { region: "GLOBAL", category: "software" });
  const { write } = drafts(
    [draftNews(1, "top", "c1"), draftNews(2, "it", "c3"), draftNews(3, "it", "c4")],
    [draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "c3")],
  );
  const result = await generateDailyBriefing({ ...slotParams, candidates: [...slotParams.candidates, otherIt] }, { write, review: passAll });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.violations.map((item) => [item.code, item.rank]), [["news.slot_duplicate", 3]]);
  assert.deepEqual(result.content.newsItems.map((item) => item.slot), ["top", "domestic", "it"]);
});

test("슬롯-속성 불일치가 마지막 시도까지 남으면 그 뉴스만 빼고, 빈 슬롯으로 발행한다", async () => {
  // domestic에 해외 사건(region GLOBAL)을 넣었다
  const { write } = drafts([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2", { region: "GLOBAL" }), draftNews(3, "it", "c3")]);
  let reviewed: (string | undefined)[] = [];
  const result = await generateDailyBriefing(slotParams, {
    write,
    review: async (content, ...rest) => { reviewed = content.newsItems.map((item) => item.slot); return passAll(content, ...rest); },
  });
  assert.equal(result.attempts, 2);
  assert.ok(result.violations.every((item) => item.code === "news.slot_mismatch" && item.rank === 2));
  assert.deepEqual(reviewed, ["top", "it"]);
  assert.deepEqual(result.content.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "it"]]);
});

test("AI가 모든 뉴스에 같은 rank를 적어도 기사마다 다른 번호로 검토해 한 번에 발행한다", async () => {
  const { write } = drafts([draftNews(1, "it", "c3", { region: "GLOBAL" }), draftNews(1, "domestic", "c2"), draftNews(1, "top", "c1")]);
  let reviewedRanks: number[] = [];
  const result = await generateDailyBriefing(slotParams, {
    write,
    review: async (content, ...rest) => { reviewedRanks = content.newsItems.map((item) => item.rank); return passAll(content, ...rest); },
  });
  assert.equal(result.attempts, 1);
  assert.deepEqual(reviewedRanks, [1, 2, 3]);
  assert.deepEqual(result.content.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "domestic"], [3, "it"]]);
});

test("같은 슬롯 두 건이 같은 AI rank여도 마지막 시도에서는 뒤 건만 빼고 발행한다", async () => {
  const otherIt = candidate("c4", { region: "GLOBAL", category: "software" });
  const twoIt = [draftNews(1, "top", "c1"), draftNews(3, "it", "c3", { region: "GLOBAL" }), draftNews(3, "it", "c4", { region: "GLOBAL" })];
  const { write } = drafts(twoIt, twoIt);
  let reviewed: (string | undefined)[] = [];
  const result = await generateDailyBriefing({ ...slotParams, candidates: [...slotParams.candidates, otherIt] }, {
    write,
    review: async (content, ...rest) => { reviewed = content.newsItems.map((item) => item.evidence?.candidateId); return passAll(content, ...rest); },
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.violations.map((item) => [item.attempt, item.code, item.rank]), [[1, "news.slot_duplicate", 3], [2, "news.slot_duplicate", 3]]);
  // 앞의 it(c3)은 남고 뒤의 it(c4)만 빠진다
  assert.deepEqual(reviewed, ["c1", "c3"]);
  assert.deepEqual(result.content.newsItems.map((item) => [item.rank, item.slot, item.evidence?.candidateId]), [[1, "top", "c1"], [2, "it", "c3"]]);
});

test("초안이 4건이면 넘친 뉴스만 빼고 3건으로 발행한다", async () => {
  const otherIt = candidate("c4", { region: "GLOBAL", category: "software" });
  const four = [draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "c3", { region: "GLOBAL" }), draftNews(4, "it", "c4", { region: "GLOBAL" })];
  const { write } = drafts(four, four);
  const result = await generateDailyBriefing({ ...slotParams, candidates: [...slotParams.candidates, otherIt] }, { write, review: passAll });
  assert.equal(result.attempts, 2);
  assert.ok(result.violations.every((item) => item.code === "news.slot_duplicate" && item.rank === 4));
  assert.deepEqual(result.content.newsItems.map((item) => [item.rank, item.slot, item.evidence?.candidateId]), [[1, "top", "c1"], [2, "domestic", "c2"], [3, "it", "c3"]]);
});
