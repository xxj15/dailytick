import { strict as assert } from "node:assert";
import test from "node:test";
import { groundCandidates, type CandidateDocuments } from "@/lib/news/ground-candidates";
import { boundForGrounding, groundMarketNews, unseenCandidates } from "@/lib/openai/ground-news";
import { NEWS_GROUND_LIMIT } from "@/config/app";
import type { NewsCandidate } from "@/types/briefing";

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

test("본문을 읽을 후보를 줄일 때 중요도가 낮아도 국내·IT 후보 자리를 먼저 잡는다", () => {
  const base = input.candidate;
  const global = Array.from({ length: 14 }, (_, i) => ({ ...base, title: `해외 ${i}`, region: "GLOBAL" as const, category: "world" as const, importance: 9 }));
  const domestic = { ...base, title: "국내 정책", category: "policy" as const, importance: 5 };
  const it = { ...base, title: "AI 발표", region: "GLOBAL" as const, category: "ai" as const, importance: 4 };
  const bounded = boundForGrounding([...global, domestic, it]);
  assert.equal(bounded.length, NEWS_GROUND_LIMIT);
  assert.ok(bounded.includes(domestic) && bounded.includes(it));
  // 중요도 순서는 그대로다
  assert.deepEqual(bounded.slice(-2), [domestic, it]);
});

/** 본문 HTML. 게시일이 기준일 안이고, 근거 문장이 들어 있다. */
const article = (url: string) => ({ url, contentType: "text/html", body: `<title>기사</title><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${quote.repeat(8)}</article>` });
const selectAll = async (inputs: CandidateDocuments[]) => ({
  selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: [{ sourceId: item.documents[0].id, quote }] })) }, inputTokens: 0, outputTokens: 0,
});

test("idPrefix를 주면 후보 id·근거 문장 id·거부 기록이 모두 그 접두어를 쓴다", async () => {
  const ok = { ...input.candidate, title: "읽히는 후보", importance: 9, sources: [{ ...input.candidate.sources[0], url: "https://example.com/ok" }] };
  const blocked = { ...input.candidate, title: "막힌 후보", importance: 5, sources: [{ ...input.candidate.sources[0], url: "https://example.com/blocked" }] };
  const result = await groundMarketNews([blocked, ok], "2026-10-09", {
    fetch: async (url) => {
      if (url.includes("blocked")) throw new Error("HTTP 403");
      return article(url);
    },
    select: selectAll,
  }, undefined, undefined, false, "r");
  assert.deepEqual(result.candidates.map((candidate) => candidate.id), ["r1"]);
  assert.deepEqual(result.candidates[0].facts.map((fact) => fact.id), ["r1-f1"]);
  assert.deepEqual(result.rejected.map((entry) => entry.candidateId), ["r2"]);
  // 접두어를 주지 않으면 1차 수집과 같은 c다
  const first = await groundMarketNews([ok], "2026-10-09", { fetch: async (url) => article(url), select: selectAll });
  assert.deepEqual(first.candidates.map((candidate) => [candidate.id, candidate.facts[0].id]), [["c1", "c1-f1"]]);
});

test("후보가 근거 확인 한도보다 많아도 중요도가 가장 낮은 국내·IT 후보의 본문을 읽는다", async () => {
  const source = (url: string) => [{ ...input.candidate.sources[0], url }];
  const global = Array.from({ length: 14 }, (_, i) => ({ ...input.candidate, title: `해외 ${i}`, region: "GLOBAL" as const, category: "world" as const, importance: 9, sources: source(`https://example.com/global/${i}`) }));
  const domestic = { ...input.candidate, title: "국내 정책", category: "policy" as const, importance: 2, sources: source("https://example.com/domestic") };
  const it = { ...input.candidate, title: "AI 발표", region: "GLOBAL" as const, category: "ai" as const, importance: 1, sources: source("https://example.com/it") };
  const fetched: string[] = [];
  const result = await groundMarketNews([...global, domestic, it], "2026-10-09", {
    fetch: async (url) => {
      fetched.push(url);
      return article(url);
    },
    select: selectAll,
  });
  assert.equal(fetched.length, NEWS_GROUND_LIMIT);
  assert.ok(fetched.includes("https://example.com/domestic") && fetched.includes("https://example.com/it"));
  assert.ok(result.candidates.some((candidate) => candidate.title === "국내 정책"));
  assert.ok(result.candidates.some((candidate) => candidate.title === "AI 발표"));
});

test("재수집 후보는 앞선 후보와 겹치는 출처만 빼고 남은 출처로 살린다", () => {
  const source = (url: string) => ({ ...input.candidate.sources[0], url });
  const previous: NewsCandidate[] = [{ ...input.candidate, title: "1차 후보", sources: [source("https://www.example.com/read/?utm_source=x")] }];
  const partly = { ...input.candidate, title: "새 후보", sources: [source("https://example.com/read"), source("https://example.com/new")] };
  const overlapped = { ...input.candidate, title: "같은 기사만 있는 후보", sources: [source("https://m.example.com/read")] };
  const sameTitle = { ...input.candidate, title: " 1차 후보 ", sources: [source("https://example.com/other")] };
  const untouched = { ...input.candidate, title: "완전히 새 후보", sources: [source("https://example.com/fresh")] };
  const result = unseenCandidates([partly, overlapped, sameTitle, untouched], previous);
  assert.deepEqual(result.map((candidate) => [candidate.title, candidate.sources.map((s) => s.url)]), [
    ["새 후보", ["https://example.com/new"]],
    ["완전히 새 후보", ["https://example.com/fresh"]],
  ]);
  // 겹치는 출처가 없으면 후보를 그대로 둔다
  assert.equal(result[1], untouched);
});
