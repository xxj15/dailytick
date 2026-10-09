import { strict as assert } from "node:assert";
import test from "node:test";
import { groundCandidates, type CandidateDocuments } from "@/lib/news/ground-candidates";
import { groundMarketNews } from "@/lib/openai/ground-news";

const quote = "위원회는 이번 회의에서 기준금리를 동결하기로 결정했다고 발표했다.";
const input: CandidateDocuments = {
  id: "c1",
  candidate: { title: "금리 동결", summary: "AI가 지어낸 수치 999", importance: 9, region: "KR", category: "rates", sources: [
    { title: "검색 제목", publisher: "검색 매체", url: "https://example.com/a", publishedAt: "2026-10-09T08:00:00+09:00" },
  ] },
  documents: [{ id: "s1", requestedUrl: "https://example.com/a", source: { title: "실제 발표", publisher: "example.com", url: "https://example.com/a", publishedAt: "2026-10-09T07:00:00+09:00" }, fetchedAt: "2026-10-09T08:00:00+09:00", contentHash: "hash", text: quote }],
};
const selection = { candidates: [{ candidateId: "c1", facts: [{ sourceId: "s1", quote }] }] };

test("검색 요약은 버리고 실제 본문 문장과 실제 게시 정보만 전달한다", () => {
  const result = groundCandidates([input], selection, "2026-10-09");
  assert.equal(result.candidates.length, 1);
  assert.ok(!("summary" in result.candidates[0]));
  assert.equal(result.candidates[0].facts[0].quote, quote);
  assert.equal(result.candidates[0].sources[0].publishedAt, "2026-10-09T07:00:00+09:00");
});

test("AI가 추가한 숫자·다른 후보의 sourceId·오래된 원문을 채택하지 않는다", () => {
  for (const fact of [{ sourceId: "s1", quote: `${quote} 표결은 7대0이었다.` }, { sourceId: "other", quote }]) {
    assert.equal(groundCandidates([input], { candidates: [{ candidateId: "c1", facts: [fact] }] }, "2026-10-09").candidates.length, 0);
  }
  const stale = { ...input, documents: [{ ...input.documents[0], source: { ...input.documents[0].source, publishedAt: "2025-10-09T07:00:00+09:00" } }] };
  assert.equal(groundCandidates([stale], selection, "2026-10-09").candidates.length, 0);
  assert.equal(groundCandidates([input], { candidates: [...selection.candidates, ...selection.candidates] }, "2026-10-09").candidates.length, 0);
});

test("원문 접근 실패 시 AI로 메우지 않고 후보를 제외한다", async () => {
  let called = false;
  const result = await groundMarketNews([input.candidate], "2026-10-09", {
    fetch: async () => { throw new Error("HTTP 403"); },
    select: async () => { called = true; throw new Error("호출하면 안 됨"); },
  });
  assert.equal(called, false);
  assert.equal(result.candidates.length, 0);
  assert.match(result.rejected[0].reason, /403/);
});

test("첫 기사 실패 시 후보에 이미 있던 공식 자료로 대체한다", async () => {
  const result = await groundMarketNews([{ ...input.candidate, sources: [...input.candidate.sources, { ...input.candidate.sources[0], url: "https://official.example.com/release" }] }], "2026-10-09", {
    fetch: async (url) => {
      if (url.endsWith("/a")) throw new Error("접근 실패");
      return { url, contentType: "text/html", body: `<title>공식 발표</title><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${quote.repeat(8)}</article>` };
    },
    select: async (inputs) => ({ selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: [{ sourceId: item.documents[0].id, quote }] })) }, inputTokens: 10, outputTokens: 5 }),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sources[0].url, "https://official.example.com/release");
});
