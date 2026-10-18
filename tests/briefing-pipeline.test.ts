import { strict as assert } from "node:assert";
import test from "node:test";
import { createDailyBriefing, type BriefingServices } from "@/lib/briefing/create-daily-briefing";
import { generateDailyBriefing } from "@/lib/openai/generate-briefing";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { CANDIDATE, DATE, DRAFT } from "./fixtures/news";
import { NewsCollectionError, type CollectNewsResult } from "@/lib/openai/collect-news";
import { TECH_ARTICLES } from "@/data/tech-articles";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";

const ALL_SECTIONS = ["politics", "world", "society", "economy", "tech"].map((section) => ({ section: section as "politics", searched: true, note: "확인" }));

function harness() {
  const saved: Parameters<BriefingServices["saveBriefing"]>[0][] = [];
  const logs: Parameters<BriefingServices["finishGenerationLog"]>[1][] = [];
  const calls = { collect: [] as unknown[], ground: [] as { titles: string[]; allowUndated?: boolean }[], curate: [] as Parameters<BriefingServices["curateKnowledge"]>[0][], generate: [] as unknown[] };
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  const existing = { ...content, tech: null, id: "existing", briefingDate: DATE, generatedAt: "2026-10-09T08:00:00+09:00", model: "test", promptVersion: "v9" };
  const searched: Pick<CollectNewsResult, "candidates" | "searchTrace" | "rejectedUrls" | "coverage"> = {
    candidates: [1, 2, 3].map((n) => ({ title: `뉴스${n}`, summary: "검색 요약", region: "KR", category: "rates", importance: 9, sources: CANDIDATE.sources })),
    searchTrace: [{ id: "search-1", action: "search", status: "completed", urls: [CANDIDATE.sources[0].url], queries: ["뉴스"] }],
    rejectedUrls: [],
    coverage: ALL_SECTIONS,
  };
  const grounded3 = [1, 2, 3].map((n) => ({ ...CANDIDATE, id: `c${n}`, title: `뉴스${n}` }));
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
  assert.deepEqual((run.calls.collect[0] as { recentNews: unknown }).recentNews, recent);
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

test("근거가 확보된 이슈가 적고 섹션을 덜 훑었으면 빠진 섹션을 한 번 더 수집한다", async () => {
  const run = harness();
  let collects = 0;
  await createDailyBriefing(DATE, {}, { ...run.services,
    collectMarketNews: async (_date, _signal, options) => {
      collects++;
      run.calls.collect.push(options);
      return { candidates: [{ title: `뉴스${collects}`, summary: "요약", region: "KR", category: "rates", importance: 9, sources: CANDIDATE.sources }],
        searchTrace: [], rejectedUrls: [], coverage: collects === 1 ? ALL_SECTIONS.slice(0, 2) : ALL_SECTIONS, inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
    },
    groundMarketNews: async (candidates) => ({ candidates: candidates.map((c, i) => ({ ...CANDIDATE, id: `c${i + 1}`, title: c.title })), rejected: [], inputTokens: 0, outputTokens: 0 }),
  });
  assert.equal(collects, 2);
  assert.deepEqual((run.calls.collect[1] as { focusSections: string[] }).focusSections, ["society", "economy", "tech"]);
  assert.equal(run.logs[0].audit?.coverage?.recollected, true);
  assert.equal(run.logs[0].audit?.coverage?.verdict, "thin_day");
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
