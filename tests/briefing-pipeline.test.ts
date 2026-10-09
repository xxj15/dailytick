import { strict as assert } from "node:assert";
import test from "node:test";
import { createDailyBriefing, type BriefingServices } from "@/lib/briefing/create-daily-briefing";
import { generateDailyBriefing } from "@/lib/openai/generate-briefing";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { CANDIDATE, DATE, DRAFT } from "./fixtures/news";
import { NewsCollectionError } from "@/lib/openai/collect-news";

function harness() {
  let saves = 0;
  const logs: Parameters<BriefingServices["finishGenerationLog"]>[1][] = [];
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  const existing = { ...content, id: "existing", briefingDate: DATE, generatedAt: "2026-10-09T08:00:00+09:00", model: "test", promptVersion: "v9" };
  const services: BriefingServices = {
    getBriefingByDate: async () => null,
    getConceptHistory: async () => [], getModel: () => "test",
    startGenerationLog: async () => "log-1",
    finishGenerationLog: async (_id, result) => { logs.push(structuredClone(result)); },
    collectMarketNews: async () => ({ candidates: [{ title: "금리", summary: "검색 요약", region: "KR", category: "rates", importance: 9, sources: CANDIDATE.sources }], inputTokens: 10, outputTokens: 5, webSearchCalls: 1, searchTrace: [{ id: "search-1", action: "search", status: "completed", urls: [CANDIDATE.sources[0].url], queries: ["금리"] }], rejectedUrls: [] }),
    groundMarketNews: async () => ({ candidates: [CANDIDATE], rejected: [], inputTokens: 20, outputTokens: 5 }),
    generateDailyBriefing: async () => ({ content, attempts: 1, violations: [], reviews: [], inputTokens: 30, outputTokens: 10 }),
    saveBriefing: async (params) => { saves++; return { ...existing, ...params.content, promptVersion: params.promptVersion }; },
  };
  return { services, logs, existing, saves: () => saves };
}

test("검색·근거·생성 사용량과 근거 metadata를 저장하고 원문 전체는 로그에 복제하지 않는다", async () => {
  const run = harness();
  const result = await createDailyBriefing(DATE, {}, run.services);
  assert.equal(result.reused, false);
  assert.equal(run.saves(), 1);
  assert.equal(run.logs[0].inputTokens, 60);
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
  assert.equal(run.logs[0].inputTokens, 90);
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
  assert.equal(run.logs[0].inputTokens, 17);
  assert.equal(run.logs[0].audit?.stage, "search");
  assert.deepEqual(run.logs[0].audit?.rejectedUrls, ["https://example.com/invented"]);
});

test("실행이 취소되면 생성 결과가 있어도 저장하지 않는다", async () => {
  const run = harness();
  await assert.rejects(() => createDailyBriefing(DATE, { signal: AbortSignal.abort() }, run.services));
  assert.equal(run.saves(), 0);
  assert.equal(run.logs[0].status, "failed");
});
