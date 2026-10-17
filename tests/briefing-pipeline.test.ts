import { strict as assert } from "node:assert";
import test from "node:test";
import { createDailyBriefing, type BriefingServices } from "@/lib/briefing/create-daily-briefing";
import { generateDailyBriefing } from "@/lib/openai/generate-briefing";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { CANDIDATE, DATE, DRAFT } from "./fixtures/news";
import { NewsCollectionError, type CollectNewsResult } from "@/lib/openai/collect-news";
import { CURRICULUM } from "@/data/curriculum";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";

/** IT 파트 기본 사용량. 검색 1 + 근거 20(경제와 같은 mock) + 작성 3 */
const TECH_TOKENS = 24;

function harness() {
  const saved: Parameters<BriefingServices["saveBriefing"]>[0][] = [];
  const logs: Parameters<BriefingServices["finishGenerationLog"]>[1][] = [];
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  const tech = { knowledgeItems: content.knowledgeItems, newsItems: content.newsItems };
  const existing = { ...content, tech: null, id: "existing", briefingDate: DATE, generatedAt: "2026-10-09T08:00:00+09:00", model: "test", promptVersion: "v9" };
  const searched: Pick<CollectNewsResult, "candidates" | "searchTrace" | "rejectedUrls"> = { candidates: [{ title: "금리", summary: "검색 요약", region: "KR", category: "rates", importance: 9, sources: CANDIDATE.sources }], searchTrace: [{ id: "search-1", action: "search", status: "completed", urls: [CANDIDATE.sources[0].url], queries: ["금리"] }], rejectedUrls: [] };
  const services: BriefingServices = {
    getBriefingByDate: async () => null,
    getConceptHistory: async () => [], getTechConceptHistory: async () => [], getModel: () => "test",
    startGenerationLog: async () => "log-1",
    finishGenerationLog: async (_id, result) => { logs.push(structuredClone(result)); },
    collectMarketNews: async () => ({ ...searched, inputTokens: 10, outputTokens: 5, webSearchCalls: 1 }),
    collectTechNews: async () => ({ ...searched, inputTokens: 1, outputTokens: 1, webSearchCalls: 1 }),
    groundMarketNews: async () => ({ candidates: [CANDIDATE], rejected: [], inputTokens: 20, outputTokens: 5 }),
    generateDailyBriefing: async () => ({ content, attempts: 1, violations: [], reviews: [], inputTokens: 30, outputTokens: 10 }),
    generateTechSection: async () => ({ content: tech, attempts: 1, violations: [], reviews: [], inputTokens: 3, outputTokens: 1 }),
    saveBriefing: async (params) => { saved.push(params); return { ...existing, ...params.content, tech: params.tech, promptVersion: params.promptVersion }; },
  };
  return { services, logs, existing, tech, saved, saves: () => saved.length };
}

test("검색·근거·생성 사용량과 근거 metadata를 저장하고 원문 전체는 로그에 복제하지 않는다", async () => {
  const run = harness();
  const result = await createDailyBriefing(DATE, {}, run.services);
  assert.equal(result.reused, false);
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].inputTokens, 60 + TECH_TOKENS);
  assert.equal(run.logs[0].webSearchCalls, 2);
  assert.equal(run.logs[0].audit?.stage, "complete");
  assert.ok(!("text" in run.logs[0].audit!.evidence[0].documents[0]));
});

test("본문을 하나도 확보하지 못하면 생성과 저장을 건너뛰고 탈락 이유를 남긴다", async () => {
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
  assert.equal(run.logs[0].inputTokens, 90 + TECH_TOKENS);
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
  assert.equal(run.logs[0].inputTokens, 17 + TECH_TOKENS);
  assert.equal(run.logs[0].audit?.stage, "search");
  assert.deepEqual(run.logs[0].audit?.rejectedUrls, ["https://example.com/invented"]);
});

test("실행이 취소되면 생성 결과가 있어도 저장하지 않는다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, { signal: AbortSignal.abort() }, run.services));
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
});

test("IT 파트가 성공하면 경제 파트와 함께 저장하고 IT 개념은 IT 커리큘럼에서 고른다", async () => {
  const run = harness();
  let economySlug = "";
  let techSlug = "";
  await createDailyBriefing(DATE, {}, { ...run.services,
    generateDailyBriefing: async (params) => { economySlug = params.concepts[0].slug; return run.services.generateDailyBriefing(params); },
    generateTechSection: async (params) => { techSlug = params.concepts[0].slug; return run.services.generateTechSection(params); },
  });
  assert.equal(economySlug, CURRICULUM[0].slug);
  assert.equal(techSlug, TECH_CURRICULUM[0].slug);
  assert.deepEqual(run.saved[0].tech, run.tech);
  assert.equal(run.logs[0].audit?.tech?.stage, "complete");
});

test("IT 파트가 실패해도 경제 파트는 발행하고 IT 실패 사유와 사용량을 남긴다", async () => {
  const run = harness();
  const result = await createDailyBriefing(DATE, {}, { ...run.services,
    collectTechNews: async () => { throw new NewsCollectionError("IT 출처 확인 실패", { inputTokens: 7, outputTokens: 2, webSearchCalls: 3 }, [], ["https://example.com/it"]); },
  });
  assert.equal(result.briefing.tech, null);
  assert.equal(run.saved[0].tech, null);
  assert.equal(run.logs[0].status, "success");
  assert.equal(run.logs[0].inputTokens, 60 + 7);
  assert.equal(run.logs[0].webSearchCalls, 1 + 3);
  assert.equal(run.logs[0].audit?.tech?.stage, "search");
  assert.equal(run.logs[0].audit?.tech?.errorMessage, "IT 출처 확인 실패");
  assert.deepEqual(run.logs[0].audit?.tech?.rejectedUrls, ["https://example.com/it"]);
});

test("IT 파트 복습일에는 IT 개념에만 복습 표시를 붙인다", async () => {
  const run = harness();
  const all = TECH_CURRICULUM.map((c) => ({ slug: c.slug, title: c.title }));
  await createDailyBriefing(DATE, {}, { ...run.services,
    getTechConceptHistory: async () => [{ briefingDate: "2026-10-08", items: all }],
  });
  assert.ok(run.saved[0].tech?.knowledgeItems.every((item) => item.review));
  assert.ok(run.saved[0].content.knowledgeItems.every((item) => !item.review));
});

test("경제 파트가 실패하면 IT 파트가 성공해도 저장하지 않고 IT 기록은 로그에 남긴다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, {}, { ...run.services,
    generateDailyBriefing: async () => { throw new Error("경제 작성 실패"); },
  }), /경제 작성 실패/);
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
  assert.ok(run.logs[0].audit?.tech);
});
