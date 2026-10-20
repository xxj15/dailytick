import { strict as assert } from "node:assert";
import test from "node:test";
import { groundCandidates, isKoreanText, type CandidateDocuments } from "@/lib/news/ground-candidates";
import { boundForGrounding, groundMarketNews } from "@/lib/openai/ground-news";
import { NEWS_GROUND_LIMIT } from "@/config/app";

const quote = "위원회는 이번 회의에서 기준금리를 동결하기로 결정했다고 발표했다.";
const input: CandidateDocuments = {
  id: "c1",
  candidate: { title: "금리 동결", summary: "AI가 지어낸 수치 999", importance: 9, region: "KR", category: "rates", sources: [
    { title: "검색 제목", publisher: "검색 매체", url: "https://example.com/a", publishedAt: "2026-10-09T08:00:00+09:00" },
  ] },
  documents: [{ id: "s1", requestedUrl: "https://example.com/a", source: { title: "실제 발표", publisher: "example.com", url: "https://example.com/a", publishedAt: "2026-10-09T07:00:00+09:00" }, fetchedAt: "2026-10-09T08:00:00+09:00", contentHash: "hash", text: quote }],
};
const selection = { candidates: [{ candidateId: "c1", facts: [{ sourceId: "s1", quote, role: "event" as const }] }] };
/** 원인·배경 문장. 주요 이슈는 무슨 일 문장과 이 문장이 함께 있어야 쓴다. */
const background = "물가 상승세가 둔화되고 경기 하방 위험이 커졌다는 판단이 이번 결정의 배경이 됐다고 설명했다.";
/** 한 기사 본문에서 무슨 일·원인 문장을 하나씩 고른 결과 */
const factsFor = (sourceId: string, event = quote) => [{ sourceId, quote: event, role: "event" as const }, { sourceId, quote: background, role: "background" as const }];

test("검색 요약은 버리고 실제 본문 문장과 실제 게시 정보만 전달한다", () => {
  const result = groundCandidates([input], selection, "2026-10-09");
  assert.equal(result.candidates.length, 1);
  assert.ok(!("summary" in result.candidates[0]));
  assert.equal(result.candidates[0].facts[0].quote, quote);
  assert.equal(result.candidates[0].sources[0].publishedAt, "2026-10-09T07:00:00+09:00");
});

test("AI가 추가한 숫자·다른 후보의 sourceId·오래된 원문을 채택하지 않는다", () => {
  for (const fact of [{ sourceId: "s1", quote: `${quote} 표결은 7대0이었다.`, role: "event" as const }, { sourceId: "other", quote, role: "event" as const }]) {
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
      return { url, contentType: "text/html", body: `<title>공식 발표</title><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${(quote + background).repeat(8)}</article>` };
    },
    select: async (inputs) => ({ selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: factsFor(item.documents[0].id) })) }, inputTokens: 10, outputTokens: 5 }),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sources[0].url, "https://official.example.com/release");
});

const englishQuote = "Tenstorrent, a chip startup focused on inference, has raised $1.5 billion at a $6.2 billion valuation.";
const page = (url: string, text: string) => ({ url, contentType: "text/html", body: `<title>기사</title><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${text.repeat(8)}</article>` });

test("영문 기사는 건너뛰고 한국어 기사 본문을 근거로 쓴다", async () => {
  const fetched: string[] = [];
  const result = await groundMarketNews([{ ...input.candidate, sources: [
    { ...input.candidate.sources[0], title: "Tenstorrent raises $1.5B", url: "https://techcrunch.example.com/a" },
    { ...input.candidate.sources[0], title: "Chip startup funding", url: "https://reuters.example.com/b" },
    { ...input.candidate.sources[0], title: "추론 칩 스타트업, 대규모 투자 유치", url: "https://etnews.example.com/c" },
  ] }], "2026-10-09", {
    fetch: async (url) => {
      fetched.push(url);
      return page(url, url.includes("etnews") ? quote + background : englishQuote);
    },
    select: async (inputs) => ({ selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: factsFor(item.documents[0].id, item.documents[0].text.includes(quote) ? quote : englishQuote) })) }, inputTokens: 0, outputTokens: 0 }),
  });
  // 한국어 제목의 출처를 먼저 읽고, 읽히면 영문 기사는 받지도 않는다
  assert.deepEqual(fetched, ["https://etnews.example.com/c"]);
  assert.equal(result.candidates[0].facts[0].quote, quote);
});

test("한국어 기사가 하나도 없으면 후보를 버린다", async () => {
  let called = false;
  const result = await groundMarketNews([{ ...input.candidate, sources: [{ ...input.candidate.sources[0], url: "https://techcrunch.example.com/a" }] }], "2026-10-09", {
    fetch: async (url) => page(url, englishQuote),
    select: async () => { called = true; throw new Error("호출하면 안 됨"); },
  });
  assert.equal(called, false);
  assert.equal(result.candidates.length, 0);
  assert.match(result.rejected[0].reason, /한국어 기사가 아닙니다/);
});

test("한국어 기사 안의 영문 문장은 근거로 받지 않는다", () => {
  const mixed = { ...input, documents: [{ ...input.documents[0], text: `${quote} ${englishQuote}` }] };
  const only = groundCandidates([mixed], { candidates: [{ candidateId: "c1", facts: [{ sourceId: "s1", quote: englishQuote, role: "event" }] }] }, "2026-10-09");
  assert.equal(only.candidates.length, 0);
  assert.match(only.rejected[0].reason, /한국어 근거 문장이 없습니다/);
  const both = groundCandidates([mixed], { candidates: [{ candidateId: "c1", facts: [{ sourceId: "s1", quote: englishQuote, role: "event" }, { sourceId: "s1", quote, role: "event" }] }] }, "2026-10-09");
  assert.deepEqual(both.candidates[0].facts.map((fact) => [fact.id, fact.quote]), [["c1-f1", quote]]);
  // 테크 상식처럼 koreanOnly를 끄면 영문 문장도 받는다
  assert.equal(groundCandidates([mixed], { candidates: [{ candidateId: "c1", facts: [{ sourceId: "s1", quote: englishQuote, role: "event" }] }] }, "2026-10-09", undefined, false, false).candidates.length, 1);
});

test("영문 표기가 많이 섞인 한국어 문장도 한국어로 본다", () => {
  assert.ok(isKoreanText("OpenAI는 GPT-5.5를 공개했다."));
  assert.ok(isKoreanText("엔비디아가 GPU 신제품을 발표했다."));
  assert.ok(!isKoreanText(englishQuote));
  assert.ok(!isKoreanText("French authorities set curfews in parts of several cities on Monday, including Paris (파리)."));
});

test("본문을 읽을 후보를 줄일 때 중요도가 낮아도 국내·IT 후보 자리를 먼저 잡는다", () => {
  const base = input.candidate;
  const global = Array.from({ length: 14 }, (_, i) => ({ ...base, title: `해외 ${i}`, region: "GLOBAL" as const, category: "world" as const, importance: 9 }));
  const economy = { ...base, title: "국내 정책", category: "policy" as const, importance: 5 };
  const it = { ...base, title: "AI 발표", region: "GLOBAL" as const, category: "ai" as const, importance: 4 };
  const bounded = boundForGrounding([...global, economy, it]);
  assert.equal(bounded.length, NEWS_GROUND_LIMIT);
  assert.ok(bounded.includes(economy) && bounded.includes(it));
  // 중요도 순서는 그대로다
  assert.deepEqual(bounded.slice(-2), [economy, it]);
});

/** 본문 HTML. 게시일이 기준일 안이고, 근거 문장이 들어 있다. */
const article = (url: string) => ({ url, contentType: "text/html", body: `<title>기사</title><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${(quote + background).repeat(8)}</article>` });
const selectAll = async (inputs: CandidateDocuments[]) => ({
  selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: factsFor(item.documents[0].id) })) }, inputTokens: 0, outputTokens: 0,
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
  assert.deepEqual(result.candidates[0].facts.map((fact) => fact.id), ["r1-f1", "r1-f2"]);
  assert.deepEqual(result.rejected.map((entry) => entry.candidateId), ["r2"]);
  // 접두어를 주지 않으면 1차 수집과 같은 c다
  const first = await groundMarketNews([ok], "2026-10-09", { fetch: async (url) => article(url), select: selectAll });
  assert.deepEqual(first.candidates.map((candidate) => [candidate.id, candidate.facts[0].id]), [["c1", "c1-f1"]]);
});

test("후보가 근거 확인 한도보다 많아도 중요도가 가장 낮은 국내·IT 후보의 본문을 읽는다", async () => {
  const source = (url: string) => [{ ...input.candidate.sources[0], url }];
  const global = Array.from({ length: 14 }, (_, i) => ({ ...input.candidate, title: `해외 ${i}`, region: "GLOBAL" as const, category: "world" as const, importance: 9, sources: source(`https://example.com/global/${i}`) }));
  const economy = { ...input.candidate, title: "국내 정책", category: "policy" as const, importance: 2, sources: source("https://example.com/economy") };
  const it = { ...input.candidate, title: "AI 발표", region: "GLOBAL" as const, category: "ai" as const, importance: 1, sources: source("https://example.com/it") };
  const fetched: string[] = [];
  const result = await groundMarketNews([...global, economy, it], "2026-10-09", {
    fetch: async (url) => {
      fetched.push(url);
      return article(url);
    },
    select: selectAll,
  });
  assert.equal(fetched.length, NEWS_GROUND_LIMIT);
  assert.ok(fetched.includes("https://example.com/economy") && fetched.includes("https://example.com/it"));
  assert.ok(result.candidates.some((candidate) => candidate.title === "국내 정책"));
  assert.ok(result.candidates.some((candidate) => candidate.title === "AI 발표"));
});

test("주요 이슈 출처는 페이지 메타데이터 대신 RSS의 매체명·제목을 쓴다", async () => {
  const rss = { title: "정보보호 공시 의무, 내년부터 全 상장사로 확대", publisher: "서울경제", url: "https://example.com/rss", publishedAt: "2026-10-09T08:00:00+09:00" };
  const result = await groundMarketNews([{ ...input.candidate, sources: [rss] }], "2026-10-09", {
    fetch: async (url) => ({ url, contentType: "text/html", body: `<title>정보보호 공시 의무 확대 | 서울경제</title><meta property="og:site_name" content="미래를 보는 창 - 서울경제"><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article>${(quote + background).repeat(8)}</article>` }),
    select: async (inputs) => ({ selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: factsFor(item.documents[0].id) })) }, inputTokens: 10, outputTokens: 5 }),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sources[0].publisher, "서울경제");
  assert.equal(result.candidates[0].sources[0].title, rss.title);
  // 게시 시각은 실제로 읽은 본문 값을 그대로 쓴다
  assert.equal(result.candidates[0].sources[0].publishedAt, "2026-10-08T22:00:00.000Z");
});

test("주요 이슈는 원인·배경 문장이 없어도 무슨 일 문장으로 받는다. 원인 문장은 있으면 요약에 넣는다", async () => {
  const result = await groundMarketNews([input.candidate], "2026-10-09", {
    fetch: async (url) => article(url),
    // 무슨 일 문장만 있다
    select: async (inputs) => ({ selection: { candidates: inputs.map((item) => ({ candidateId: item.id, facts: [{ sourceId: item.documents[0].id, quote, role: "event" as const }] })) }, inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].facts.map((fact) => fact.role), ["event"]);
  // 테크 상식(원인 문장을 요구하지 않는 근거 확인)은 무슨 일 문장만으로 받는다
  assert.equal(groundCandidates([input], selection, "2026-10-09", undefined, false, false, false).candidates.length, 1);
});

test("주요 이슈는 후보마다 본문 한 건만 읽는다. 첫 기사가 읽히면 나머지 출처는 읽지 않는다", async () => {
  const sources = [
    { ...input.candidate.sources[0], title: "코스피 장중 4% 급락", url: "https://example.com/first" },
    { ...input.candidate.sources[0], title: "Kospi slides", url: "https://example.com/english" },
    { ...input.candidate.sources[0], title: "코스피 급락 배경은", url: "https://example.com/second" },
  ];
  const fetched: string[] = [];
  let documents = 0;
  const result = await groundMarketNews([{ ...input.candidate, sources }], "2026-10-09", {
    fetch: async (url) => {
      fetched.push(url);
      return page(url, quote + background);
    },
    select: async (inputs) => {
      documents = inputs[0].documents.length;
      return { selection: { candidates: [{ candidateId: inputs[0].id, facts: factsFor(inputs[0].documents[0].id) }] }, inputTokens: 1, outputTokens: 1 };
    },
  });
  // 토큰을 아끼려고 본문은 한 건만 읽는다
  assert.deepEqual(fetched, ["https://example.com/first"]);
  assert.equal(documents, 1);
  assert.deepEqual(result.candidates[0].facts.map((fact) => fact.role), ["event", "background"]);
});

test("테크 아티클 원문은 역할별 개수를 보지 않는다. 주요 이슈는 무슨 일 문장이 3개면 거른다", () => {
  const three = ["첫 번째 핵심 문장으로 원문에 그대로 들어 있는 설명이다.", "두 번째 핵심 문장으로 원문에 그대로 들어 있는 설명이다.", "세 번째 핵심 문장으로 원문에 그대로 들어 있는 설명이다."];
  const doc = { ...input, documents: [{ ...input.documents[0], text: three.join(" ") }] };
  const picked = { candidates: [{ candidateId: "c1", facts: three.map((quote) => ({ sourceId: "s1", quote, role: "event" as const })) }] };
  // 테크 상식(원인 문장을 요구하지 않는 근거 확인)
  assert.equal(groundCandidates([doc], picked, "2026-10-09", undefined, false, false, false).candidates.length, 1);
  // 주요 이슈는 원인 문장도 없고 무슨 일 문장이 상한을 넘는다
  assert.equal(groundCandidates([doc], picked, "2026-10-09", undefined, false, true, true).candidates.length, 0);
});
