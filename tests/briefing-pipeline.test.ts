import { strict as assert } from "node:assert";
import test from "node:test";
import { createDailyBriefing, type BriefingServices } from "@/lib/briefing/create-daily-briefing";
import { generateDailyBriefing, type GenerateBriefingDependencies } from "@/lib/openai/generate-briefing";
import { dailyBriefingSchema, newsCandidateSchema, stripNulls } from "@/lib/openai/schemas";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { CANDIDATE, DATE, DRAFT, candidate, draftNews } from "./fixtures/news";
import { NewsCollectionError, type CollectNewsResult } from "@/lib/openai/collect-news";
import { boundForGrounding, groundMarketNews, GroundNewsError } from "@/lib/openai/ground-news";
import { buildNewsCollectionPrompt } from "@/lib/openai/prompts";
import type { NewsCandidate, NewsSlot } from "@/types/briefing";
import { TECH_ARTICLES } from "@/data/tech-articles";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";

const ALL_SECTIONS = ["politics", "world", "society", "economy", "tech"].map((section) => ({ section: section as "politics", searched: true, note: "확인" }));

function harness() {
  const saved: Parameters<BriefingServices["saveBriefing"]>[0][] = [];
  const logs: Parameters<BriefingServices["finishGenerationLog"]>[1][] = [];
  const calls = { collect: [] as unknown[], ground: [] as { titles: string[]; allowUndated?: boolean }[], curate: [] as Parameters<BriefingServices["curateKnowledge"]>[0][], generate: [] as unknown[] };
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  const existing = { ...content, tech: null, id: "existing", briefingDate: DATE, generatedAt: "2026-10-09T08:00:00+09:00", model: "test", promptVersion: "v9" };
  // 세 슬롯을 모두 채울 수 있는 후보: 화제(국내 금리)·국내(정책)·IT(해외 AI)
  const kinds = [
    { region: "KR", category: "rates" },
    { region: "KR", category: "policy" },
    { region: "GLOBAL", category: "ai" },
  ] as const;
  const searched: Pick<CollectNewsResult, "candidates" | "searchTrace" | "rejectedUrls" | "coverage"> = {
    candidates: kinds.map((kind, i) => ({ title: `뉴스${i + 1}`, summary: "검색 요약", ...kind, importance: 9, sources: CANDIDATE.sources })),
    searchTrace: [{ id: "search-1", action: "search", status: "completed", urls: [CANDIDATE.sources[0].url], queries: ["뉴스"] }],
    rejectedUrls: [],
    coverage: ALL_SECTIONS,
  };
  const grounded3 = kinds.map((kind, i) => ({ ...CANDIDATE, ...kind, id: `c${i + 1}`, title: `뉴스${i + 1}` }));
  const services: BriefingServices = {
    getBriefingByDate: async () => null,
    getConceptHistory: async () => [], getTechConceptHistory: async () => [], getRecentNews: async () => [],
    getModel: () => "test",
    startGenerationLog: async () => "log-1",
    finishGenerationLog: async (_id, result) => { logs.push(structuredClone(result)); },
    collectMarketNews: async (...args) => { calls.collect.push(args[2]); return { ...searched, inputTokens: 10, outputTokens: 5, webSearchCalls: 1 }; },
    discoverTechTopics: async () => ({ topics: [], searchTrace: [], rejectedUrls: [], inputTokens: 1, outputTokens: 1, webSearchCalls: 1 }),
    curateKnowledge: async (params) => { calls.curate.push(params); return { picks: [{ id: params.candidates[0].id, title: params.candidates[0].title, reason: "첫 후보" }], inputTokens: 2, outputTokens: 1 }; },
    groundMarketNews: async (candidates, _date, _signal, _maxAge, allowUndated) => {
      calls.ground.push({ titles: candidates.map((c) => c.title), allowUndated });
      return { candidates: candidates.length > 1 ? grounded3 : [{ ...CANDIDATE, title: candidates[0].title }], rejected: [], inputTokens: 20, outputTokens: 5 };
    },
    generateDailyBriefing: async (params) => { calls.generate.push(params); return { content, attempts: 1, violations: [], reviews: [], inputTokens: 30, outputTokens: 10 }; },
    generateTechSection: async (params) => ({
      content: { knowledgeItems: content.knowledgeItems.map((item) => ({ ...item, ...params.concepts[0] })), newsItems: [] },
      attempts: 1, violations: [], reviews: [], inputTokens: 3, outputTokens: 1,
    }),
    saveBriefing: async (params) => { saved.push(params); return { ...existing, ...params.content, tech: params.tech, promptVersion: params.promptVersion }; },
  };
  return { services, logs, existing, saved, calls, saves: () => saved.length };
}

test("주요 이슈·경제 상식·테크 상식을 만들어 저장하고, 섹션 훑기와 큐레이션 기록을 남긴다", async () => {
  const run = harness();
  const result = await createDailyBriefing(DATE, {}, run.services);
  assert.equal(result.reused, false);
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].audit?.stage, "complete");
  assert.equal(run.logs[0].audit?.coverage?.verdict, "ok");
  // 1차 수집은 슬롯마다 한 번씩 세 번이다. 세 슬롯 모두 근거 있는 후보가 있으면 다시 수집하지 않는다
  assert.deepEqual(run.calls.collect.map((option) => (option as CollectOption)?.slot), ["top", "domestic", "it"]);
  assert.ok(run.calls.collect.every((option) => !(option as CollectOption)?.focusSlots));
  // 세 호출이 같은 후보(같은 제목·같은 URL)를 냈어도 합친 후보에는 한 번씩만 남는다
  assert.deepEqual(run.logs[0].audit?.coverage?.firstPass, [{ slot: "top", candidates: 3 }, { slot: "domestic", candidates: 3 }, { slot: "it", candidates: 3 }]);
  assert.equal(run.logs[0].audit?.coverage?.candidates, 3);
  assert.deepEqual(run.logs[0].audit?.coverage?.slots.map((entry) => [entry.slot, entry.grounded]), [["top", 3], ["domestic", 2], ["it", 1]]);
  assert.equal(run.logs[0].audit?.curation?.status, "curated");
  assert.equal(run.logs[0].audit?.tech?.curation?.status, "curated");
  assert.ok(run.saved[0].tech?.knowledgeItems.length);
  assert.equal(run.saved[0].tech?.newsItems.length, 0);
  assert.ok(!("text" in run.logs[0].audit!.evidence[0].documents[0]));
});

test("경제 큐레이터에는 오늘의 주요 이슈 제목을 참고로 넘기고, 최근 뉴스는 수집·작성에 넘긴다", async () => {
  const run = harness();
  const recent = [{ briefingDate: "2026-10-08", title: "어제 뉴스", whatHappened: "…", urls: ["https://example.com/old"] }];
  await createDailyBriefing(DATE, {}, { ...run.services, getRecentNews: async () => recent });
  const economy = run.calls.curate.find((call) => call.kind === "economy");
  assert.deepEqual(economy?.newsTitles, ["뉴스1", "뉴스2", "뉴스3"]);
  // 1차 슬롯 호출마다 최근 뉴스를 넘긴다
  assert.equal(run.calls.collect.length, 3);
  for (const option of run.calls.collect) assert.deepEqual((option as { recentNews: unknown }).recentNews, recent);
  assert.deepEqual((run.calls.generate[0] as { recentNews: unknown }).recentNews, recent);
});

test("아티클을 고르면 원문 근거를 확인한 뒤 원문 링크와 함께 쓴다", async () => {
  const run = harness();
  const article = TECH_ARTICLES[0];
  await createDailyBriefing(DATE, {}, { ...run.services,
    curateKnowledge: async (params) => ({ picks: params.kind === "tech"
      ? [{ id: article.slug, title: "다듬은 제목", reason: "실무 설계" }]
      : [{ id: params.candidates[0].id, title: params.candidates[0].title, reason: "" }], inputTokens: 0, outputTokens: 0 }),
  });
  const item = run.saved[0].tech?.knowledgeItems[0];
  assert.equal(item?.format, "article");
  assert.equal(item?.title, "다듬은 제목");
  assert.ok(item?.references?.[0].url);
  assert.ok(run.calls.ground.some((call) => call.titles[0] === article.title && call.allowUndated === true));
});

test("추천을 하나도 쓰지 못하면 검증된 커리큘럼 개념으로 대체하고 사유를 남긴다", async () => {
  const run = harness();
  await createDailyBriefing(DATE, {}, { ...run.services,
    curateKnowledge: async (params) => {
      if (params.kind === "economy") return { picks: [{ id: params.candidates[0].id, title: "", reason: "" }], inputTokens: 0, outputTokens: 0 };
      throw new Error("큐레이터 장애");
    },
  });
  assert.equal(run.logs[0].audit?.tech?.curation?.status, "fallback");
  assert.match(run.logs[0].audit?.tech?.curation?.error ?? "", /큐레이터 장애/);
  assert.equal(run.saved[0].tech?.knowledgeItems[0].format, "concept");
});

test("검증된 후보가 하나도 없으면 테크 상식은 보류하고 나머지는 발행한다", async () => {
  const run = harness();
  const learnedAll = [{ briefingDate: "2026-10-08", items: [...TECH_CURRICULUM, ...TECH_ARTICLES].map((entry) => ({ slug: entry.slug, title: entry.title })) }];
  const topic = { title: "검색 글", summary: "요약", field: "frontend" as const, format: "trend" as const, learning: 8,
    candidate: { title: "검색 글", summary: "요약", region: "GLOBAL" as const, category: "software" as const, importance: 8, sources: CANDIDATE.sources } };
  await createDailyBriefing(DATE, {}, { ...run.services,
    getTechConceptHistory: async () => learnedAll,
    discoverTechTopics: async () => ({ topics: [topic], searchTrace: [], rejectedUrls: [], inputTokens: 0, outputTokens: 0, webSearchCalls: 0 }),
    groundMarketNews: async (candidates, ...rest) => candidates[0].title === "검색 글"
      ? { candidates: [], rejected: [{ candidateId: "c1", reason: "게시일 없음" }], inputTokens: 0, outputTokens: 0 }
      : run.services.groundMarketNews(candidates, ...rest),
  });
  assert.equal(run.saved[0].tech, null);
  assert.equal(run.logs[0].status, "success");
  assert.equal(run.logs[0].audit?.tech?.curation?.status, "skipped");
  assert.ok(run.logs[0].audit?.tech?.curation?.rejected?.some((reason) => reason.includes("게시일 없음")));
});

/** 받은 후보를 모두 근거 확인된 후보로 돌려준다. id는 실제 구현처럼 접두어(1차 c, 재수집 r)와 위치로 매긴다. */
const groundAs: BriefingServices["groundMarketNews"] = async (candidates, _date, _signal, _maxAge, _allowUndated, idPrefix = "c") => ({
  candidates: candidates.map((c, i) => candidate(`${idPrefix}${i + 1}`, { title: c.title, region: c.region, category: c.category, importance: c.importance })),
  rejected: [], inputTokens: 0, outputTokens: 0,
});
const passReview: GenerateBriefingDependencies["review"] = async (content) => ({
  review: { news: content.newsItems.map((item) => ({ rank: item.rank, supported: true, reason: "일치" })), framing: { supported: true, reason: "교육" } }, inputTokens: 0, outputTokens: 0,
});
/** 작성은 정해 둔 초안으로, 검토는 모두 통과로 실제 생성기를 돌린다. */
function writeNews(newsItems: ReturnType<typeof draftNews>[], seen?: { ids: string[] }): BriefingServices["generateDailyBriefing"] {
  return async (params) => {
    if (seen) seen.ids = params.candidates.map((c) => c.id);
    return generateDailyBriefing(params, {
      write: async () => ({ draft: { ...DRAFT, knowledgeItems: params.concepts.map((concept) => ({ ...DRAFT.knowledgeItems[0], ...concept })), newsItems }, inputTokens: 0, outputTokens: 0 }),
      review: passReview,
    });
  };
}
type Batch = Partial<NewsCandidate>[] | (() => never);
type CollectOption = Parameters<BriefingServices["collectMarketNews"]>[2];

/**
 * 묶음을 수집 결과로 바꾼다. 묶음이 함수면 그 오류를 던진다.
 * 기본 제목·출처 URL에 tag를 넣는다. 1차 슬롯 호출은 슬롯 이름(https://example.com/top/0), 재수집은 회차(https://example.com/2/0)다.
 */
function collected(batch: Batch | undefined, tag: string | number, coverage = ALL_SECTIONS): CollectNewsResult {
  if (typeof batch === "function") return batch();
  return {
    candidates: (batch ?? []).map((entry, i) => ({
      title: `후보${tag}-${i}`, summary: "요약", region: "KR", category: "rates", importance: 9,
      sources: [{ ...CANDIDATE.sources[0], url: `https://example.com/${tag}/${i}` }], ...entry,
    } as NewsCandidate)),
    searchTrace: [], rejectedUrls: [], coverage, inputTokens: 0, outputTokens: 0, webSearchCalls: 0,
  };
}

/**
 * 수집 결과. 1차 수집(슬롯별 호출 세 개)은 슬롯마다 firstPass의 묶음을 돌려준다. 묶음이 없는 슬롯은 빈 결과다.
 * 재수집(focusSlots)은 호출할 때마다 recollect의 다음 묶음을 돌려준다. 첫 재수집이 2회차다.
 * firstPass·recollects에 각 호출의 옵션을 남긴다.
 */
function collectBySlot(firstPass: Partial<Record<NewsSlot, Batch>>, recollect: Batch[] = [], coverage = ALL_SECTIONS) {
  const calls = { firstPass: [] as CollectOption[], recollects: [] as CollectOption[] };
  const collect: BriefingServices["collectMarketNews"] = async (_date, _signal, option) => {
    if (option?.focusSlots?.length) {
      calls.recollects.push(option);
      return collected(recollect[calls.recollects.length - 1], calls.recollects.length + 1, coverage);
    }
    calls.firstPass.push(option);
    return collected(option?.slot ? firstPass[option.slot] : undefined, option?.slot ?? "none", coverage);
  };
  return { collect, ...calls };
}

/** 1차 수집은 화제 호출만 첫 묶음을 돌려주고 국내·IT 호출은 빈 결과를 돌려준다. 재수집은 둘째 묶음부터 차례로 돌려준다. */
function collectBatches([first, ...recollect]: Batch[], coverage = ALL_SECTIONS) {
  return collectBySlot({ top: first }, recollect, coverage);
}

test("빈 슬롯: 근거 있는 IT 후보가 없으면 IT만 겨냥해 다시 수집하고, 끝내 없으면 화제·국내만 발행하고 빈 슬롯을 남긴다", async () => {
  const run = harness();
  const { collect, firstPass, recollects } = collectBatches([
    [{ title: "국내 금리", region: "KR", category: "rates" }, { title: "국내 정책", region: "KR", category: "policy" }],
    [{ title: "국내 증시", region: "KR", category: "stocks" }],
  ]);
  const seen = { ids: [] as string[] };
  const grounds: string[][] = [];
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, ...rest) => {
      grounds.push(candidates.map((c) => c.title));
      return groundAs(candidates, ...rest);
    },
    // IT 슬롯은 맞는 후보가 없으니 화제·국내만 쓴다
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")], seen),
  });
  assert.equal(firstPass.length, 3);
  assert.equal(recollects.length, 1);
  assert.deepEqual(recollects[0]?.focusSlots, ["it"]);
  // 재수집 후보 가운데 빈 슬롯(IT)에 맞지 않는 국내 증시는 본문을 읽지 않는다
  assert.deepEqual(grounds, [["국내 금리", "국내 정책"]]);
  assert.deepEqual(seen.ids, ["c1", "c2"]);
  assert.deepEqual(result.briefing.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "domestic"]]);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.recollected, true);
  assert.deepEqual(coverage?.recollectedSlots, ["it"]);
  // 다섯 섹션을 다 훑었는데 IT 후보 자체가 없었던 날
  assert.equal(coverage?.verdict, "thin_day");
  assert.deepEqual(coverage?.slots.map((entry) => [entry.slot, entry.status, entry.rank ?? entry.reason]), [
    ["top", "filled", 1],
    ["domestic", "filled", 2],
    ["it", "empty", "근거가 확인된 후보로 채울 수 없었다"],
  ]);
});

test("IT 후보는 있었는데 본문 확인에서 모두 떨어지면 출처 문제로 기록한다", async () => {
  const run = harness();
  await createDailyBriefing(DATE, {}, { ...run.services,
    groundMarketNews: async (candidates) => ({
      candidates: candidates.filter((c) => c.category !== "ai").map((c, i) => candidate(`c${i + 1}`, { title: c.title, region: c.region, category: c.category })),
      rejected: [{ candidateId: "c3", reason: "HTTP 403" }], inputTokens: 0, outputTokens: 0,
    }),
  });
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.verdict, "sources_failed");
  assert.deepEqual(coverage?.slots.find((entry) => entry.slot === "it"), { slot: "it", candidates: 1, grounded: 0, status: "empty", reason: "근거가 확인된 후보로 채울 수 없었다" });
});

test("재수집은 1차와 겹치지 않는 새 후보만 본문을 확인해 1차 결과에 더하고, 채웠던 슬롯을 잃지 않는다", async () => {
  const run = harness();
  const { collect, recollects } = collectBatches([
    [{ title: "국내 금리", category: "rates" }, { title: "국내 정책", category: "policy" }, { title: "AI 발표", region: "GLOBAL", category: "ai", sources: [{ ...CANDIDATE.sources[0], url: "https://blocked.example.com/ai" }] }],
    [
      { title: "국내 금리", category: "rates" }, // 1차와 같은 제목
      { title: "금리 동결 후속", category: "rates", sources: [{ ...CANDIDATE.sources[0], url: "https://example.com/top/0" }] }, // 1차와 같은 URL
      { title: "새 AI 모델", region: "GLOBAL", category: "ai" },
    ],
  ]);
  const grounds: string[][] = [];
  const seen = { ids: [] as string[] };
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, date, signal, maxAge, allowUndated, idPrefix) => {
      grounds.push(candidates.map((c) => c.title));
      // 1차의 IT 후보는 본문을 읽지 못한다
      const ok = candidates.filter((c) => !c.sources.some((source) => source.url.includes("blocked")));
      const result = await groundAs(ok, date, signal, maxAge, allowUndated, idPrefix);
      return { ...result, rejected: candidates.length === ok.length ? [] : [{ candidateId: "c3", url: "https://blocked.example.com/ai", reason: "HTTP 403" }] };
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "r1", { region: "GLOBAL" })], seen),
  });
  // 재수집 프롬프트에는 1차 후보 제목과 버려진 URL을 넘긴다
  assert.deepEqual(recollects[0]?.focusSlots, ["it"]);
  assert.deepEqual(recollects[0]?.previousTitles, ["국내 금리", "국내 정책", "AI 발표"]);
  assert.deepEqual(recollects[0]?.rejectedUrls, ["https://blocked.example.com/ai"]);
  // 겹치는 후보는 다시 읽지 않는다. 1차 근거도 다시 읽지 않는다
  assert.deepEqual(grounds, [["국내 금리", "국내 정책", "AI 발표"], ["새 AI 모델"]]);
  // 1차 결과에 더해지고, id와 근거 문장 id가 겹치지 않는다
  assert.deepEqual(seen.ids, ["c1", "c2", "r1"]);
  const factIds = run.logs[0].audit?.evidence.flatMap((entry) => entry.facts.map((fact) => fact.id)) ?? [];
  assert.equal(new Set(factIds).size, factIds.length);
  assert.deepEqual(result.briefing.newsItems.map((item) => [item.rank, item.slot, item.evidence?.candidateId]), [[1, "top", "c1"], [2, "domestic", "c2"], [3, "it", "r1"]]);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.verdict, "ok");
  assert.equal(coverage?.recollectError, undefined);
  assert.equal(coverage?.candidates, 4);
  assert.equal(coverage?.grounded, 3);
});

test("재수집이 예외를 던져도 1차에서 채운 슬롯으로 발행하고 재수집 실패를 남긴다", async () => {
  const run = harness();
  const { collect } = collectBatches([
    [{ title: "국내 금리", category: "rates" }, { title: "국내 정책", category: "policy" }],
    () => { throw new NewsCollectionError("뉴스 후보 수집 실패: 구조화된 응답을 받지 못했습니다.", { inputTokens: 7, outputTokens: 3, webSearchCalls: 4 }, [], ["https://example.com/invented"]); },
  ]);
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(result.briefing.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "domestic"]]);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.recollected, true);
  assert.deepEqual(coverage?.recollectedSlots, ["it"]);
  assert.match(coverage?.recollectError ?? "", /구조화된 응답/);
  // 실패한 재수집의 검색 사용량과 거절 URL도 남긴다
  // 재수집 4회 + 테크 상식 발굴 1회
  assert.equal(run.logs[0].webSearchCalls, 5);
  assert.deepEqual(run.logs[0].audit?.rejectedUrls, ["https://example.com/invented"]);
  assert.deepEqual(coverage?.slots.find((entry) => entry.slot === "it")?.status, "empty");
});

test("재수집 후보의 본문 확인이 실패해도 1차 결과로 발행한다", async () => {
  const run = harness();
  const { collect } = collectBatches([
    [{ title: "국내 금리", category: "rates" }, { title: "국내 정책", category: "policy" }],
    [{ title: "새 AI 모델", region: "GLOBAL", category: "ai" }],
  ]);
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, ...rest) => {
      if (rest[4] === "r") throw new GroundNewsError("근거 문장 선택 실패", [{ candidateId: "r1", url: "https://example.com/2/0", reason: "HTTP 500" }]);
      return groundAs(candidates, ...rest);
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.deepEqual(result.briefing.newsItems.map((item) => item.slot), ["top", "domestic"]);
  const coverage = run.logs[0].audit?.coverage;
  assert.match(coverage?.recollectError ?? "", /근거 문장 선택 실패/);
  // 재수집으로 IT 후보를 찾았지만 본문 확인에서 떨어졌다
  assert.equal(coverage?.verdict, "sources_failed");
  assert.ok(run.logs[0].audit?.sourceRejections.some((entry) => entry.candidateId === "r1"));
});

/** 1차 수집: 국내 후보 둘. IT 슬롯이 비어 재수집을 부른다. */
const KR_ONLY: Partial<NewsCandidate>[] = [{ title: "국내 금리", category: "rates" }, { title: "국내 정책", category: "policy" }];

test("재수집이 자기 시간 예산을 넘기면 작성·검토 몫을 남기고 끊은 뒤, 1차에서 채운 슬롯으로 발행하고 이유를 남긴다", async (t) => {
  // 실행 기한(260초) 가운데 작성·검토 몫(110초)을 남긴 150초가 재수집 예산이다. 가짜 시계로 그 시점을 넘긴다.
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const run = harness();
  const first = collectBatches([KR_ONLY]);
  let generateSignal: AbortSignal | undefined;
  const aborted: (boolean | undefined)[] = [];
  const writer = writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]);
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      if (!option?.focusSlots) return first.collect(date, signal, option);
      // 재수집 응답이 오지 않는 사이 시간이 흐른다
      t.mock.timers.tick(149_999);
      aborted.push(signal?.aborted);
      t.mock.timers.tick(1);
      aborted.push(signal?.aborted);
      throw signal?.reason ?? new Error("재수집 신호가 끊기지 않았다");
    },
    groundMarketNews: groundAs,
    generateDailyBriefing: async (params) => { generateSignal = params.signal; return writer(params); },
  });
  // 작성·검토 몫이 남는 시점(150초)에 재수집만 끊는다. 실행 전체는 멈추지 않는다
  assert.deepEqual(aborted, [false, true]);
  assert.equal(generateSignal?.aborted, false);
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(result.briefing.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "domestic"]]);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.recollected, true);
  assert.match(coverage?.recollectError ?? "", /재수집 시간 예산\(150초\)을 넘겨/);
  assert.equal(coverage?.slots.find((entry) => entry.slot === "it")?.status, "empty");
});

test("재수집 뒤 근거 확인할 시간이 남지 않으면 본문을 읽지 않고 1차 결과로 발행한다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const run = harness();
  const { collect } = collectBatches([KR_ONLY, [{ title: "새 AI 모델", region: "GLOBAL", category: "ai" }]]);
  const prefixes: (string | undefined)[] = [];
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      const result = await collect(date, signal, option);
      // 재수집 수집이 예산 150초 가운데 130초를 썼다. 근거 확인 하한(30초)보다 적게 남는다.
      if (option?.focusSlots) t.mock.timers.tick(130_000);
      return result;
    },
    groundMarketNews: async (candidates, ...rest) => {
      prefixes.push(rest[4]);
      return groundAs(candidates, ...rest);
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.deepEqual(prefixes, [undefined]);
  assert.equal(run.saves(), 1);
  assert.match(run.logs[0].audit?.coverage?.recollectError ?? "", /본문을 확인할 시간이 남지 않아/);
});

test("재수집 중 실행 자체가 취소되면 1차 결과로도 발행하지 않고 멈춘다", async () => {
  const run = harness();
  const controller = new AbortController();
  const first = collectBatches([KR_ONLY]);
  let generated = false;
  await assert.rejects(() => createDailyBriefing(DATE, { signal: controller.signal }, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      if (!option?.focusSlots) return first.collect(date, signal, option);
      controller.abort(new Error("cron 요청 취소"));
      signal?.throwIfAborted();
      throw new Error("재수집 신호가 실행 취소를 따르지 않았다");
    },
    groundMarketNews: groundAs,
    generateDailyBriefing: async () => { generated = true; throw new Error("호출하면 안 됨"); },
  }), /cron 요청 취소/);
  assert.equal(generated, false);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
});

/** 1차 수집: 국내 금리 10건(중요도 9)과 IT 4건(5~2). 근거 확인 한도(12)에 IT d와 국내 9가 잘려 읽히지 않는다. */
const CROWDED: Partial<NewsCandidate>[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ title: `국내 ${i}`, category: "rates" as const })),
  ...([["IT a", 5], ["IT b", 4], ["IT c", 3], ["IT d", 2]] as const).map(([title, importance]) => ({ title, region: "GLOBAL" as const, category: "ai" as const, importance })),
];
/** 실제 근거 확인처럼 한도 안의 후보만 읽고, 읽은 제목을 grounds에 남긴다. 1차에서 읽은 IT 후보는 본문 접근에 실패한다. */
function groundCrowded(grounds: string[][]): BriefingServices["groundMarketNews"] {
  return async (candidates, date, signal, maxAge, allowUndated, idPrefix) => {
    const read = boundForGrounding(candidates);
    grounds.push(read.map((c) => c.title));
    return groundAs(idPrefix === "r" ? read : read.filter((c) => c.category !== "ai"), date, signal, maxAge, allowUndated, idPrefix);
  };
}

test("재수집 근거 확인은 빈 슬롯에 맞는 새 후보와 1차에서 읽지 못한 후보만 읽는다", async () => {
  const run = harness();
  const { collect, recollects } = collectBatches([
    CROWDED,
    [{ title: "새 AI 모델", region: "GLOBAL", category: "ai" }, { title: "국내 증시", category: "stocks" }],
  ]);
  const grounds: string[][] = [];
  const collectSignals: (AbortSignal | undefined)[] = [];
  const groundSignals: (AbortSignal | undefined)[] = [];
  const seen = { ids: [] as string[] };
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      collectSignals.push(signal);
      return collect(date, signal, option);
    },
    groundMarketNews: async (candidates, date, signal, maxAge, allowUndated, idPrefix) => {
      groundSignals.push(signal);
      // 실제 근거 확인처럼 한도 안의 후보만 읽는다. 1차에서 읽은 IT 후보는 본문 접근에 실패한다.
      const read = boundForGrounding(candidates);
      grounds.push(read.map((c) => c.title));
      const ok = idPrefix === "r" ? read : read.filter((c) => c.category !== "ai");
      return groundAs(ok, date, signal, maxAge, allowUndated, idPrefix);
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "r1", { region: "GLOBAL" })], seen),
  });
  assert.deepEqual(recollects[0]?.focusSlots, ["it"]);
  assert.equal(grounds[0].length, 12);
  assert.ok(!grounds[0].includes("IT d") && !grounds[0].includes("국내 9"));
  // 1차에서 읽지 못한 IT d와 새 IT 후보만 읽는다. 빈 슬롯과 무관한 국내 9·국내 증시, 이미 읽은 IT a~c는 읽지 않는다.
  assert.deepEqual(grounds[1], ["새 AI 모델", "IT d"]);
  // 1차 슬롯 호출 세 개와 1차 근거 확인은 실행 신호로 돈다.
  // 재수집의 수집과 근거 확인은 같은 재수집 전용 신호(자기 시간 예산)로 돈다. 1차와는 다르다.
  const [top, domestic, it, recollect] = collectSignals;
  const [firstGround, reground] = groundSignals;
  assert.ok(top === firstGround && domestic === firstGround && it === firstGround);
  assert.equal(recollect, reground);
  assert.notEqual(recollect, firstGround);
  assert.deepEqual(seen.ids.filter((id) => id.startsWith("r")), ["r1", "r2"]);
  assert.deepEqual(result.briefing.newsItems.map((item) => item.slot), ["top", "domestic", "it"]);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.verdict, "ok");
  assert.equal(coverage?.candidates, 16);
});

test("재수집이 1차에서 읽지 못한 후보를 다시 내도 재수집 근거 확인에서 한 번만 읽는다", async () => {
  const run = harness();
  // 1차의 IT d와 제목이 같고 URL은 다른 후보
  const { collect } = collectBatches([CROWDED, [{ title: "IT d", region: "GLOBAL", category: "ai" }]]);
  const grounds: string[][] = [];
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundCrowded(grounds),
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "r1", { region: "GLOBAL" })]),
  });
  assert.deepEqual(grounds[1], ["IT d"]);
  assert.equal(run.logs[0].audit?.coverage?.candidates, 14);
});

test("재수집 후보가 1차에서 읽지 않은 다른 후보와 제목이 같으면 수집 기록에 두 번 세지 않는다", async () => {
  const run = harness();
  // 국내 9는 1차에서 한도에 잘렸고 빈 슬롯(IT)에도 맞지 않는다. 재수집이 같은 제목을 다른 URL로 다시 낸다.
  const { collect } = collectBatches([CROWDED, [{ title: "국내 9", category: "rates" }, { title: "새 AI 모델", region: "GLOBAL", category: "ai" }]]);
  const grounds: string[][] = [];
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundCrowded(grounds),
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "r1", { region: "GLOBAL" })]),
  });
  assert.deepEqual(grounds[1], ["새 AI 모델", "IT d"]);
  // 1차 14건 + 새 AI 모델
  assert.equal(run.logs[0].audit?.coverage?.candidates, 15);
});

test("재수집 근거 확인 중 예산이 끝나 본문을 하나도 읽지 못하면 끊긴 사실을 남기고 1차 슬롯으로 발행한다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const run = harness();
  const { collect } = collectBatches([KR_ONLY, [{ title: "새 AI 모델", region: "GLOBAL", category: "ai" }]]);
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, date, signal, maxAge, allowUndated, idPrefix) => {
      if (idPrefix !== "r") return groundAs(candidates, date, signal, maxAge, allowUndated, idPrefix);
      // 실제 근거 확인. 본문을 받는 사이 재수집 예산(150초)이 끝난다. 읽은 본문이 없으면 던지지 않고 빈 결과를 돌려준다.
      return groundMarketNews(candidates, date, {
        fetch: async (_url, fetchSignal) => {
          t.mock.timers.tick(150_000);
          fetchSignal?.throwIfAborted();
          throw new Error("예산이 끝나지 않았다");
        },
        select: async () => { throw new Error("호출하면 안 됨"); },
      }, signal, maxAge, allowUndated, idPrefix);
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(result.briefing.newsItems.map((item) => [item.rank, item.slot]), [[1, "top"], [2, "domestic"]]);
  const coverage = run.logs[0].audit?.coverage;
  assert.match(coverage?.recollectError ?? "", /재수집 시간 예산\(150초\)을 넘겨/);
  assert.ok(run.logs[0].audit?.sourceRejections.some((entry) => entry.candidateId === "r1"));
});

test("재수집에서 훑은 섹션은 1차 기록에 합치고, 다 훑었는데도 IT 후보가 없으면 그날 사정으로 기록한다", async () => {
  const run = harness();
  const { collect } = collectBatches([KR_ONLY, [{ title: "국내 증시", category: "stocks" }]]);
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      const result = await collect(date, signal, option);
      // 1차 슬롯 호출은 모두 두 섹션만 훑었고, 재수집이 다섯 섹션을 다 훑었다
      return { ...result, coverage: option?.focusSlots ? ALL_SECTIONS : ALL_SECTIONS.slice(0, 2) };
    },
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.sections.length, 5);
  assert.equal(coverage?.verdict, "thin_day");
});

test("빈 슬롯 후보를 수집했지만 본문 확인에서 떨어졌다면 섹션을 덜 훑었어도 출처 문제로 기록한다", async () => {
  const run = harness();
  const { collect } = collectBatches([[...KR_ONLY, { title: "AI 발표", region: "GLOBAL", category: "ai" }], []], ALL_SECTIONS.slice(0, 2));
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, ...rest) => groundAs(candidates.filter((c) => c.category !== "ai"), ...rest),
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  // 출처 문제(sources_failed)가 검색 범위 문제(narrow_search)보다 먼저다
  assert.equal(run.logs[0].audit?.coverage?.verdict, "sources_failed");
});

test("1차 수집이 오래 걸려 남은 시간이 재수집 하한 이하이면 빈 슬롯이 있어도 다시 수집하지 않는다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const run = harness();
  const { collect, firstPass, recollects } = collectBatches([KR_ONLY, []]);
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      // 동시에 도는 1차 슬롯 호출들이 90초 걸려 남은 시간이 하한(170초)과 같아졌다
      if (option?.slot === "top") t.mock.timers.tick(90_000);
      return collect(date, signal, option);
    },
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.equal(firstPass.length, 3);
  assert.equal(recollects.length, 0);
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.recollected, false);
  assert.deepEqual(coverage?.recollectedSlots, []);
});

test("1차 검색에서 거부된 URL과 본문 확인에서 버려진 URL을 재수집 프롬프트로 넘긴다", async () => {
  const run = harness();
  const { collect, recollects } = collectBatches([KR_ONLY, []]);
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      const result = await collect(date, signal, option);
      return option?.slot === "top" ? { ...result, rejectedUrls: ["https://example.com/invented"] } : result;
    },
    groundMarketNews: async (candidates, ...rest) => ({
      ...(await groundAs(candidates, ...rest)),
      rejected: [{ candidateId: "c3", url: "https://blocked.example.com/ai", reason: "HTTP 403" }],
    }),
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.deepEqual(recollects[0]?.rejectedUrls, ["https://example.com/invented", "https://blocked.example.com/ai"]);
});

test("근거 있는 후보로 채울 수 있었던 슬롯이 작성·검토에서 빠지면 그 이유를 남긴다", async () => {
  const run = harness();
  await createDailyBriefing(DATE, {}, { ...run.services,
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.verdict, "ok");
  assert.equal(coverage?.recollected, false);
  assert.deepEqual(coverage?.slots.map((entry) => [entry.slot, entry.status, entry.rank ?? entry.reason]), [
    ["top", "filled", 1],
    ["domestic", "filled", 2],
    ["it", "empty", "작성·검토 단계에서 빠졌다"],
  ]);
});

test("빈 슬롯에 맞는 후보가 없고 섹션도 덜 훑었으면 검색 범위 문제로 기록한다", async () => {
  const run = harness();
  const { collect } = collectBatches([
    [{ title: "국내 금리", category: "rates" }, { title: "국내 정책", category: "policy" }],
    [{ title: "국내 증시", category: "stocks" }],
  ], ALL_SECTIONS.slice(0, 2));
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.recollected, true);
  assert.equal(coverage?.verdict, "narrow_search");
});

/** 출처 하나짜리 sources. */
const at = (path: string) => [{ ...CANDIDATE.sources[0], url: `https://example.com/${path}` }];

test("1차 슬롯 수집을 합칠 때 제목이 같거나 출처 URL이 겹치는 후보는 한 사건으로 묶어 새 출처만 붙이고, 국내·IT 호출의 후보를 남긴다", async () => {
  const run = harness();
  const { collect, firstPass } = collectBySlot({
    domestic: [{ title: "국내 금리", category: "rates", sources: at("rate") }, { title: "국내 정책", category: "policy", sources: at("policy") }],
    it: [{ title: "AI 발표", region: "GLOBAL", category: "ai", sources: at("ai") }],
    top: [
      // 국내 호출과 같은 제목: 두 번째 후보가 되지 않고 새 출처만 국내 쪽 후보에 붙는다
      { title: "국내 금리", category: "rates", sources: at("rate-top") },
      // IT 호출과 출처 하나가 겹치고 화제 호출은 IT가 아닌 분류로 냈다: IT 쪽 후보가 남고 새 출처만 붙는다
      { title: "AI 반도체 발표", region: "GLOBAL", category: "world", sources: [...at("ai"), ...at("ai-top")] },
      { title: "태풍 상륙", category: "society", sources: at("storm") },
    ],
  });
  const grounds: NewsCandidate[][] = [];
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: async (candidates, ...rest) => {
      grounds.push(candidates);
      return groundAs(candidates, ...rest);
    },
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2"), draftNews(3, "it", "c3", { region: "GLOBAL" })]),
  });
  assert.equal(firstPass.length, 3);
  assert.deepEqual(grounds[0].map((c) => c.title), ["국내 금리", "국내 정책", "AI 발표", "태풍 상륙"]);
  assert.deepEqual(grounds[0][0].sources.map((source) => source.url), ["https://example.com/rate", "https://example.com/rate-top"]);
  assert.equal(grounds[0][2].category, "ai");
  assert.deepEqual(grounds[0][2].sources.map((source) => source.url), ["https://example.com/ai", "https://example.com/ai-top"]);
  const urls = grounds[0].flatMap((c) => c.sources.map((source) => source.url));
  assert.equal(new Set(urls).size, urls.length);
  // 호출별 기록은 낸 후보를 그대로 세고(지면 순서), 합친 후보 수는 묶은 것을 뺀 수다
  assert.deepEqual(run.logs[0].audit?.coverage?.firstPass?.map((entry) => [entry.slot, entry.candidates]), [["top", 3], ["domestic", 2], ["it", 1]]);
  assert.equal(run.logs[0].audit?.coverage?.candidates, 4);
});

test("1차 슬롯 호출 하나가 실패해도 나머지 슬롯 후보로 발행하고, 실패한 슬롯과 그 호출의 사용량·검색 기록·거부 URL을 남긴다", async () => {
  const run = harness();
  const trace = [{ id: "search-it", action: "search" as const, status: "completed", urls: [], queries: ["AI"] }];
  const { collect, firstPass } = collectBySlot({
    top: [{ title: "국내 금리", category: "rates" }],
    domestic: [{ title: "국내 정책", category: "policy" }],
    it: () => { throw new NewsCollectionError("확인할 수 없는 출처", { inputTokens: 7, outputTokens: 3, webSearchCalls: 4 }, trace, ["https://example.com/invented"]); },
  });
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  assert.equal(firstPass.length, 3);
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(result.briefing.newsItems.map((item) => item.slot), ["top", "domestic"]);
  const audit = run.logs[0].audit;
  assert.deepEqual(audit?.coverage?.firstPass, [
    { slot: "top", candidates: 1 },
    { slot: "domestic", candidates: 1 },
    { slot: "it", candidates: 0, error: "확인할 수 없는 출처" },
  ]);
  assert.deepEqual(audit?.rejectedUrls, ["https://example.com/invented"]);
  assert.ok(audit?.searchTrace.some((entry) => entry.id === "search-it"));
  // 실패한 IT 호출 4회 + 테크 상식 발굴 1회. 빈 IT 슬롯 재수집은 검색 0회다
  assert.equal(run.logs[0].webSearchCalls, 5);
  assert.equal(audit?.coverage?.candidates, 2);
});

test("1차 슬롯 호출이 모두 실패하면 수집 실패로 멈추고, 세 슬롯의 이유·사용량·거부 URL을 모두 남긴다", async () => {
  const run = harness();
  const fail = (slot: NewsSlot) => (): never => {
    throw new NewsCollectionError(`${slot} 출처 거절`, { inputTokens: 1, outputTokens: 1, webSearchCalls: 2 }, [], [`https://example.com/invented-${slot}`]);
  };
  const { collect, firstPass } = collectBySlot({ top: fail("top"), domestic: fail("domestic"), it: fail("it") });
  await assert.rejects(
    () => createDailyBriefing(DATE, {}, { ...run.services, collectMarketNews: collect }),
    /세 슬롯 모두\): top: top 출처 거절 \/ domestic: domestic 출처 거절 \/ it: it 출처 거절/,
  );
  // 시간 초과가 아니므로 다시 시도하지 않는다
  assert.equal(firstPass.length, 3);
  assert.equal(run.calls.generate.length, 0);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
  assert.equal(run.logs[0].audit?.stage, "search");
  assert.deepEqual([...(run.logs[0].audit?.rejectedUrls ?? [])].sort(), ["https://example.com/invented-domestic", "https://example.com/invented-it", "https://example.com/invented-top"]);
  // 세 호출 6회 + 테크 상식 발굴 1회
  assert.equal(run.logs[0].webSearchCalls, 7);
});

test("1차 슬롯 호출이 모두 실패했고 시간 초과로 끝난 슬롯이 있으면, 시간이 남을 때 그 슬롯만 한 번 더 시도한다", async () => {
  const run = harness();
  const slots: (NewsSlot | undefined)[] = [];
  const retry = collectBySlot({ domestic: [{ title: "국내 정책", category: "policy" }], it: [{ title: "AI 발표", region: "GLOBAL", category: "ai" }] });
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (date, signal, option) => {
      if (option?.focusSlots) return retry.collect(date, signal, option);
      slots.push(option?.slot);
      if (slots.length > 3) return retry.collect(date, signal, option);
      if (option?.slot === "top") throw new NewsCollectionError("뉴스 후보 수집 실패: 구조화된 응답을 받지 못했습니다.", { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 }, []);
      throw new Error("Request timed out.");
    },
    groundMarketNews: groundAs,
    // 화제에 쓸 후보가 남지 않아 국내·IT만 쓴다
    generateDailyBriefing: writeNews([draftNews(1, "domestic", "c1"), draftNews(2, "it", "c2", { region: "GLOBAL" })]),
  });
  // 처음 세 호출 뒤 시간 초과로 끝난 국내·IT만 다시 부른다
  assert.deepEqual(slots, ["top", "domestic", "it", "domestic", "it"]);
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(result.briefing.newsItems.map((item) => item.slot), ["domestic", "it"]);
  assert.deepEqual(run.logs[0].audit?.coverage?.firstPass, [
    { slot: "top", candidates: 0, error: "뉴스 후보 수집 실패: 구조화된 응답을 받지 못했습니다." },
    { slot: "domestic", candidates: 1 },
    { slot: "it", candidates: 1 },
  ]);
});

test("1차 슬롯 호출이 모두 시간 초과여도 남은 시간이 하한보다 적으면 다시 시도하지 않고 수집 실패로 멈춘다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const run = harness();
  const slots: (NewsSlot | undefined)[] = [];
  await assert.rejects(() => createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (_date, _signal, option) => {
      slots.push(option?.slot);
      // 동시에 도는 세 호출이 120초를 썼다. 남은 140초는 다시 시도할 하한(150초)보다 적다
      if (option?.slot === "top") t.mock.timers.tick(120_000);
      throw new Error("Request timed out.");
    },
  }), /세 슬롯 모두\): top: Request timed out\./);
  assert.deepEqual(slots, ["top", "domestic", "it"]);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
});

test("수집 프롬프트는 서버 신선도 검사와 같은 게시 시각 범위를 밝히고, 범위 밖 기사는 서버가 버린다고 알린다", () => {
  const range = /2026-10-16 00:00 ~ 2026-10-19 23:59 \(KST\)/;
  for (const prompt of [
    buildNewsCollectionPrompt("2026-10-19"),
    buildNewsCollectionPrompt("2026-10-19", { slot: "domestic" }),
    buildNewsCollectionPrompt("2026-10-19", { focusSlots: ["it"] }),
  ]) {
    assert.match(prompt, range);
    assert.match(prompt, /범위 밖 기사는 서버가 버린다/);
    assert.match(prompt, /사건이 이 범위보다 먼저 일어났어도 sources에는 범위 안에 게시된 최신 기사를 넣는다/);
  }
});

test("1차 슬롯 수집 프롬프트는 맡은 슬롯 후보만 4~5개 찾게 하고 재수집 문구는 넣지 않는다", () => {
  const prompt = buildNewsCollectionPrompt(DATE, { slot: "it", recentNews: [{ briefingDate: "2026-10-08", title: "어제 뉴스", whatHappened: "…", urls: [] }] });
  assert.match(prompt, /it\(IT\) 슬롯의 오늘의 주요 이슈 후보를 4~5개 수집하라/);
  assert.match(prompt, /- it\(IT\): AI/);
  assert.match(prompt, /이번 수집이 맡는 섹션은 tech이다/);
  assert.match(prompt, /- it\(IT\) 후보를 4~5개 찾았는가\?/);
  assert.match(prompt, /\[2026-10-08\] 어제 뉴스/);
  assert.doesNotMatch(prompt, /- top\(오늘의 화제\): 오늘 주요 일간지|- domestic\(국내 정세\): 국회/);
  assert.doesNotMatch(prompt, /앞선 수집|10~15개|세 슬롯의 후보를/);
  assert.match(buildNewsCollectionPrompt(DATE, { slot: "domestic" }), /이번 수집이 맡는 섹션은 politics·world·economy이다/);
});

test("1차 화제 수집 프롬프트는 섹션을 깊게 훑지 말고 주요 매체 헤드라인에서 빠르게 고르게 한다. 재수집·전체 수집의 화제 문구는 그대로다", () => {
  const top = buildNewsCollectionPrompt(DATE, { slot: "top" });
  assert.match(top, /- top\(오늘의 화제\): 섹션마다 깊게 검색하지 않는다\. 주요 일간지·통신사·방송의 1면·메인 헤드라인에서[^\n]*4~5개를 빠르게 고른다/);
  assert.match(top, /sources에는 3번처럼 찾은 개별 기사 URL을 넣는다/);
  assert.match(top, /이번 수집은 섹션을 하나씩 깊게 훑지 않는다/);
  assert.doesNotMatch(top, /분야를 가리지 않고 훑는다|이번 수집이 맡는 섹션은/);
  // 화제는 분야를 가리지 않으므로 국내·IT 사건도 고르게 한다. 국내·IT 호출만 다른 슬롯 후보를 찾지 말라고 한다
  assert.match(top, /이번 수집은 이 슬롯만 맡는다\. 분야와 상관없이 오늘 가장 크게 다룬 사건을 고른다\. 국내 정세·IT 사건이어도 된다\(서버가 다른 수집 결과와 합친다\)\./);
  assert.doesNotMatch(top, /그 후보는 찾지 않는다/);
  for (const slot of ["domestic", "it"] as const) {
    assert.match(buildNewsCollectionPrompt(DATE, { slot }), /이번 수집은 이 슬롯만 맡는다\. 나머지 슬롯은 다른 수집이 따로 찾으므로 그 후보는 찾지 않는다\./);
  }
  for (const prompt of [buildNewsCollectionPrompt(DATE, { focusSlots: ["top"] }), buildNewsCollectionPrompt(DATE)]) {
    assert.match(prompt, /- top\(오늘의 화제\): 오늘 주요 일간지·통신사·방송이 함께 크게 다룬 사건을 찾는다\. 분야를 가리지 않고 훑는다\./);
    assert.doesNotMatch(prompt, /1면·메인 헤드라인/);
  }
});

test("수집 후보의 중요도가 정수가 아니거나 1~10 밖이면 거절하지 않고 반올림한 뒤 1~10으로 자른다", () => {
  const base = { title: "국내 금리", summary: "요약", region: "KR", category: "rates", sources: CANDIDATE.sources };
  const importance = (value: number) => newsCandidateSchema.parse({ ...base, importance: value }).importance;
  assert.equal(importance(8.5), 9);
  assert.equal(importance(7.2), 7);
  assert.equal(importance(10.4), 10);
  assert.equal(importance(10.5), 10);
  assert.equal(importance(11), 10);
  assert.equal(importance(0.4), 1);
});

test("수집 프롬프트는 게시 시각 범위가 최대 한도일 뿐이고 최근 24시간 보도를 우선한다고 밝힌다", () => {
  assert.match(
    buildNewsCollectionPrompt("2026-10-19", { slot: "it" }),
    /\(KST\) 범위 안인 기사만 쓴다\.\n {3}이 범위는 서버가 받는 최대 한도다\. 후보는 최근 24시간 보도를 우선하고, 48시간이 지난 사건은 오늘 새로 바뀐 점이 있을 때만 낸다\./,
  );
});

test("1차 슬롯 호출마다 훑은 섹션이 달라도 합친 기록은 실제로 훑은 섹션의 합이고, 그래도 IT 후보가 없으면 그날 사정으로 기록한다", async () => {
  const run = harness();
  const sections = (searched: string[]) => ALL_SECTIONS.map((entry) => ({ ...entry, searched: searched.includes(entry.section), note: searched.includes(entry.section) ? "확인" : "맡지 않음" }));
  const bySlot: Record<NewsSlot, ReturnType<typeof sections>> = {
    top: sections(["politics"]),
    domestic: sections(["politics", "world", "economy"]),
    it: sections(["tech"]),
  };
  const { collect } = collectBySlot({ top: [{ title: "국내 금리", category: "rates" }], domestic: [{ title: "국내 정책", category: "policy" }], it: [] });
  await createDailyBriefing(DATE, {}, { ...run.services,
    // 빈 IT 슬롯 재수집도 아무 섹션을 더 훑지 못했다
    collectMarketNews: async (date, signal, option) => ({ ...(await collect(date, signal, option)), coverage: option?.slot ? bySlot[option.slot] : sections([]) }),
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  const coverage = run.logs[0].audit?.coverage;
  assert.equal(coverage?.sections.length, 5);
  assert.deepEqual(coverage?.sections.filter((entry) => entry.searched).map((entry) => entry.section).sort(), ["economy", "politics", "tech", "world"]);
  assert.equal(coverage?.verdict, "thin_day");
});

test("1차 슬롯 호출 하나만 시간 초과면 그 슬롯을 다시 부르지 않고 나머지로 진행하며 실패를 기록한다", async () => {
  const run = harness();
  const { collect, firstPass } = collectBySlot({
    top: [{ title: "국내 금리", category: "rates" }],
    domestic: [{ title: "국내 정책", category: "policy" }],
    it: () => { throw new Error("Request timed out."); },
  });
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: collect,
    groundMarketNews: groundAs,
    generateDailyBriefing: writeNews([draftNews(1, "top", "c1"), draftNews(2, "domestic", "c2")]),
  });
  // 1차 슬롯 호출은 세 번뿐이다. 빈 IT 슬롯은 뒤의 재수집(focusSlots)이 맡는다
  assert.deepEqual(firstPass.map((option) => option?.slot), ["top", "domestic", "it"]);
  assert.equal(run.logs[0].status, "success");
  assert.deepEqual(run.logs[0].audit?.coverage?.firstPass?.find((entry) => entry.slot === "it"), { slot: "it", candidates: 0, error: "Request timed out." });
});

test("기사가 적은 날 키워드가 1~2개여도 지면 검증을 통과하고, 5개를 넘으면 거절한다", () => {
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  assert.equal(dailyBriefingSchema.safeParse({ ...content, todayKeywords: ["기준금리 동결"] }).success, true);
  assert.equal(dailyBriefingSchema.safeParse({ ...content, todayKeywords: [] }).success, false);
  assert.equal(dailyBriefingSchema.safeParse({ ...content, todayKeywords: ["가", "나", "다", "라", "마", "바"] }).success, false);
});

test("재수집 프롬프트에 겨냥할 슬롯, 앞선 후보 제목, 버려진 URL이 들어가고 1차 수집에는 없다", () => {
  const prompt = buildNewsCollectionPrompt(DATE, {
    focusSlots: ["it"], previousTitles: ["국내 금리 동결"], rejectedUrls: ["https://blocked.example.com/ai"],
  });
  assert.match(prompt, /it\(IT\): tech 섹션/);
  // 국내 정세 재수집은 외교·안보가 들어가는 world 섹션도 훑는다
  assert.match(buildNewsCollectionPrompt(DATE, { focusSlots: ["domestic"] }), /domestic\(국내 정세\): politics·world·economy 섹션/);
  assert.match(prompt, /이미 낸 후보[^\n]*\n- 국내 금리 동결/);
  assert.match(prompt, /버려진 URL[^\n]*\n- https:\/\/blocked\.example\.com\/ai/);
  const first = buildNewsCollectionPrompt(DATE);
  assert.doesNotMatch(first, /앞선 수집/);
  assert.doesNotMatch(first, /blocked/);
  // 재수집은 비어 있는 슬롯 후보만 찾는다. 세 슬롯 10~15개를 다시 요구하지 않는다
  assert.match(prompt, /아래 슬롯의 오늘의 주요 이슈 후보만 수집하라: it\(IT\)/);
  assert.doesNotMatch(prompt, /10~15개|세 슬롯의 후보를|- top\(오늘의 화제\): 오늘 주요 일간지/);
  assert.match(first, /후보를 10~15개 수집하라/);
  assert.match(first, /- top\(오늘의 화제\): 오늘 주요 일간지[\s\S]*- domestic\(국내 정세\): 국회[\s\S]*- it\(IT\): AI/);
});

test("미리보기(dryRun)는 같은 흐름을 돌리되 저장도 로그도 남기지 않는다", async () => {
  const run = harness();
  let started = false;
  const result = await createDailyBriefing(DATE, { dryRun: true }, { ...run.services,
    getBriefingByDate: async () => run.existing,
    startGenerationLog: async () => { started = true; return "log"; },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.reused, false);
  assert.equal(run.saves(), 0);
  assert.equal(started, false);
  assert.ok(result.briefing.newsItems.length);
});

test("본문을 하나도 확보하지 못하면 작성과 저장을 건너뛰고 탈락 이유를 남긴다", async () => {
  const run = harness();
  let generated = false;
  await assert.rejects(() => createDailyBriefing(DATE, {}, { ...run.services,
    groundMarketNews: async () => ({ candidates: [], rejected: [{ candidateId: "c1", reason: "본문 접근 실패" }], inputTokens: 0, outputTokens: 0 }),
    generateDailyBriefing: async () => { generated = true; throw new Error("호출하면 안 됨"); },
  }), /실제 본문/);
  assert.equal(generated, false);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
  assert.equal(run.logs[0].audit?.sourceRejections[0].reason, "본문 접근 실패");
});

test("실제 생성기의 의미 검토가 거절하면 DB에 쓰지 않고 위반·검토 내역을 남긴다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, { force: true }, { ...run.services,
    generateDailyBriefing: async (params) => generateDailyBriefing(params, {
      write: async () => ({ draft: { ...DRAFT, knowledgeItems: params.concepts.map((concept) => ({ ...DRAFT.knowledgeItems[0], ...concept })) }, inputTokens: 10, outputTokens: 5 }),
      review: async () => ({ review: { news: [{ rank: 1, supported: false, reason: "사실에 없는 관측된 시장 반응" }], framing: { supported: true, reason: "교육" } }, inputTokens: 20, outputTokens: 5 }),
    }),
  }));
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].violations?.[0].code, "news.unsupported");
  assert.equal(run.logs[0].audit?.reviews.length, 2);
});

test("기존 브리핑이 있으면 검색·생성·덮어쓰기를 하지 않는다", async () => {
  const run = harness();
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    getBriefingByDate: async () => run.existing,
    collectMarketNews: async () => { throw new Error("호출하면 안 됨"); },
  });
  assert.equal(result.reused, true);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs.length, 0);
});

test("검색 출처가 거절되어도 실제 검색 사용량과 거절 URL을 로그에 남긴다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async () => { throw new NewsCollectionError("확인할 수 없는 출처", { inputTokens: 17, outputTokens: 6, webSearchCalls: 2 }, [], ["https://example.com/invented"]); },
  }));
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].audit?.stage, "search");
  assert.deepEqual(run.logs[0].audit?.rejectedUrls, ["https://example.com/invented"]);
});

test("실행이 취소되면 생성 결과가 있어도 저장하지 않는다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, { signal: AbortSignal.abort() }, run.services));
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
});
