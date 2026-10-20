import { strict as assert } from "node:assert";
import test from "node:test";
import type { CurriculumConcept } from "@/data/curriculum";
import { normalizeBriefing, verifyBriefing } from "@/lib/briefing/verify";
import type {
  DailyBriefingContent,
  KnowledgeItem,
  NewsIssue,
} from "@/types/briefing";

const DATE = "2026-09-17";
const FRESH = "2026-09-17T07:00:00+09:00";
const STALE = "2026-09-01T09:00:00+09:00";

const CONCEPT: CurriculumConcept = {
  slug: "base-rate",
  title: "기준금리",
  level: 3,
  category: "rates-bonds",
};

function knowledge(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    slug: CONCEPT.slug,
    title: CONCEPT.title,
    level: CONCEPT.level,
    category: CONCEPT.category,
    definition: "정의",
    explanation: "설명",
    securitiesPoint: "증권사 연결",
    interviewQuestion: "면접 질문",
    keywords: ["금리"],
    ...overrides,
  };
}

function news(overrides: Partial<NewsIssue> = {}): NewsIssue {
  return {
    rank: 1,
    title: "뉴스",
    region: "KR",
    category: "rates",
    whatHappened: "무슨 일",
    whyImportant: "왜 중요한가",
    marketImpact: {},
    sources: [
      {
        publisher: "한국경제",
        title: "기사",
        url: "https://example.com/a",
        publishedAt: FRESH,
      },
    ],
    ...overrides,
  };
}

function briefing(overrides: Partial<DailyBriefingContent> = {}): DailyBriefingContent {
  return {
    knowledgeItems: [knowledge()],
    newsItems: [news()],
    todayKeywords: ["기준금리"],
    oneLiner: "한 줄",
    ...overrides,
  };
}

test("기준을 지킨 지면은 위반이 없다", () => {
  const violations = verifyBriefing(briefing(), {
    date: DATE,
    concepts: [CONCEPT],
  });

  assert.deepEqual(violations, []);
});

test("코드가 고른 개념이 아니면 걸러낸다", () => {
  const violations = verifyBriefing(
    briefing({ knowledgeItems: [knowledge({ slug: "market-rate" })] }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, "knowledge.slug");
});

test("개념 개수가 다르면 걸러낸다", () => {
  const violations = verifyBriefing(
    briefing({ knowledgeItems: [knowledge(), knowledge({ slug: "per" })] }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, "knowledge.count");
});

test("게시 시각을 확인할 수 없는 출처뿐이면 발행하지 않는다", () => {
  const item = news();
  const violations = verifyBriefing(
    briefing({
      newsItems: [
        news({
          sources: [{ ...item.sources[0], publishedAt: undefined }],
        }),
      ],
    }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, "news.freshness");
});

test("오래된 출처만 달린 뉴스는 오늘 일로 올리지 않는다", () => {
  const item = news();
  const violations = verifyBriefing(
    briefing({
      newsItems: [news({ sources: [{ ...item.sources[0], publishedAt: STALE }] })],
    }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.equal(violations[0].code, "news.freshness");
});

test("최신 출처가 하나라도 있으면 통과한다", () => {
  const item = news();
  const violations = verifyBriefing(
    briefing({
      newsItems: [
        news({
          sources: [
            { ...item.sources[0], publishedAt: STALE },
            { ...item.sources[0], url: "https://example.com/b", publishedAt: FRESH },
          ],
        }),
      ],
    }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.deepEqual(violations, []);
});

test("위반을 한 번에 모아서 돌려준다", () => {
  const item = news();
  const violations = verifyBriefing(
    briefing({
      knowledgeItems: [knowledge({ slug: "per" })],
      newsItems: [news({ sources: [{ ...item.sources[0], publishedAt: STALE }] })],
    }),
    { date: DATE, concepts: [CONCEPT] },
  );

  assert.deepEqual(
    violations.map((v) => v.code),
    ["knowledge.slug", "news.freshness"],
  );
});

test("AI가 매긴 rank와 상관없이 슬롯 순서(화제 → 국내 → IT)로 두고 rank를 1부터 다시 매긴다", () => {
  const normalized = normalizeBriefing(
    briefing({
      newsItems: [
        news({ rank: 1, slot: "it", title: "IT", region: "GLOBAL", category: "ai" }),
        news({ rank: 2, slot: "top", title: "화제", region: "GLOBAL" }),
        news({ rank: 3, slot: "economy", title: "국내" }),
      ],
    }),
    { concepts: [CONCEPT] },
  );

  assert.deepEqual(
    normalized.newsItems.map((n) => [n.rank, n.slot, n.title]),
    [
      [1, "top", "화제"],
      [2, "economy", "국내"],
      [3, "it", "IT"],
    ],
  );
});

test("빈 슬롯은 건너뛰고 번호를 잇는다", () => {
  const normalized = normalizeBriefing(
    briefing({ newsItems: [news({ rank: 3, slot: "it", category: "ai" }), news({ rank: 1, slot: "top" })] }),
    { concepts: [CONCEPT] },
  );
  assert.deepEqual(normalized.newsItems.map((n) => [n.rank, n.slot]), [[1, "top"], [2, "it"]]);
});

test("slot이 없는 과거 기사는 슬롯 규칙을 보지 않고 지금처럼 rank 순서로 둔다", () => {
  const legacy = [
    news({ rank: 2, title: "둘째", region: "GLOBAL", category: "ai" }),
    news({ rank: 1, title: "첫째", region: "GLOBAL", category: "ai" }),
  ];
  assert.deepEqual(verifyBriefing(briefing({ newsItems: legacy }), { date: DATE, concepts: [CONCEPT] }), []);
  const normalized = normalizeBriefing(briefing({ newsItems: legacy }), { concepts: [CONCEPT] });
  assert.deepEqual(normalized.newsItems.map((n) => [n.rank, n.title]), [[1, "첫째"], [2, "둘째"]]);
});

/** 같은 사건(후보) 검사용. verify는 candidateId만 본다. */
function fromCandidate(candidateId: string): NewsIssue["evidence"] {
  return { candidateId, facts: [{ id: `${candidateId}-f1`, sourceId: "s1", quote: "근거 문장" }], documents: [{ id: "s1", requestedUrl: "https://example.com/a", url: "https://example.com/a", fetchedAt: FRESH, contentHash: "a" }] };
}

const slotCodes = (items: NewsIssue[]) =>
  verifyBriefing(briefing({ newsItems: items }), { date: DATE, concepts: [CONCEPT] })
    .filter((v) => v.code.startsWith("news.slot") || v.code === "news.same_event")
    .map((v) => [v.code, v.rank]);

test("세 슬롯이 서로 다른 사건이고 속성이 맞으면 통과한다", () => {
  assert.deepEqual(slotCodes([
    news({ rank: 1, slot: "top", region: "GLOBAL", category: "world", evidence: fromCandidate("c1") }),
    news({ rank: 2, slot: "economy", category: "policy", evidence: fromCandidate("c2") }),
    news({ rank: 3, slot: "it", region: "KR", category: "semiconductor", evidence: fromCandidate("c3") }),
  ]), []);
});

test("경제 사건을 주요 시사와 경제 두 슬롯에 쓰면 주요 시사 쪽이 분류 불일치로 걸린다", () => {
  // 세 슬롯의 분류는 겹치지 않는다. 같은 사건은 한 슬롯에만 맞으므로 다른 슬롯에 쓴 쪽이 걸린다
  assert.deepEqual(slotCodes([
    news({ rank: 2, slot: "economy", evidence: fromCandidate("c1") }),
    news({ rank: 1, slot: "top", evidence: fromCandidate("c1") }),
  ]), [["news.slot_mismatch", 1]]);
  // 주요 시사에 시사 사건을 두면 통과한다
  assert.deepEqual(slotCodes([
    news({ rank: 1, slot: "top", category: "society", evidence: fromCandidate("c1") }),
    news({ rank: 2, slot: "economy", evidence: fromCandidate("c2") }),
  ]), []);
});

test("같은 슬롯을 두 번 쓰면 뒤 rank를 가리킨다", () => {
  assert.deepEqual(slotCodes([
    news({ rank: 1, slot: "top", category: "world" }),
    news({ rank: 2, slot: "it", category: "ai", region: "GLOBAL" }),
    news({ rank: 3, slot: "it", category: "software", region: "GLOBAL" }),
  ]), [["news.slot_duplicate", 3]]);
});

test("슬롯과 분류가 맞지 않으면 그 rank를 가리키고, 맞지 않는 뉴스는 자리를 차지하지 않는다", () => {
  assert.deepEqual(slotCodes([news({ rank: 2, slot: "economy", category: "politics" })]), [["news.slot_mismatch", 2]]);
  // 해외 경제 사건도 경제 슬롯에 들어간다
  assert.deepEqual(slotCodes([news({ rank: 2, slot: "economy", region: "GLOBAL", category: "rates" })]), []);
  assert.deepEqual(slotCodes([news({ rank: 2, slot: "economy", category: "ai" })]), [["news.slot_mismatch", 2]]);
  assert.deepEqual(slotCodes([news({ rank: 3, slot: "it", category: "rates" })]), [["news.slot_mismatch", 3]]);
  // 앞의 틀린 it이 자리를 잡지 않으므로 뒤의 맞는 it은 중복으로 걸리지 않는다
  assert.deepEqual(slotCodes([
    news({ rank: 2, slot: "it", category: "policy" }),
    news({ rank: 3, slot: "it", category: "ai" }),
  ]), [["news.slot_mismatch", 2]]);
});

test("슬롯 위반 메시지는 후보 id와 제목으로 어느 기사인지 가리킨다", () => {
  const messages = (items: NewsIssue[]) =>
    verifyBriefing(briefing({ newsItems: items }), { date: DATE, concepts: [CONCEPT] })
      .filter((v) => v.code.startsWith("news.slot"))
      .map((v) => v.message);
  const [duplicate] = messages([
    news({ rank: 2, slot: "it", category: "ai", title: "엔비디아 신형 칩", evidence: fromCandidate("c3") }),
    news({ rank: 3, slot: "it", category: "software", title: "오픈AI 새 모델", evidence: fromCandidate("r1") }),
  ]);
  assert.match(duplicate, /^뉴스 3\(후보 r1 "오픈AI 새 모델"\): .*뉴스 2\(후보 c3 "엔비디아 신형 칩"\)가 이미 차지/);
  const [mismatch] = messages([news({ rank: 2, slot: "economy", category: "politics", title: "여야 예산 협상", evidence: fromCandidate("c4") })]);
  assert.match(mismatch, /^뉴스 2\(후보 c4 "여야 예산 협상"\): economy/);
});

test("개념의 식별 정보는 커리큘럼 값으로 되돌린다", () => {
  const normalized = normalizeBriefing(
    briefing({
      knowledgeItems: [
        knowledge({ title: "기준금리란 무엇인가", level: 1, category: "macro" }),
      ],
    }),
    { concepts: [CONCEPT] },
  );

  const item = normalized.knowledgeItems[0];

  assert.equal(item.title, "기준금리");
  assert.equal(item.level, 3);
  assert.equal(item.category, "rates-bonds");
  assert.equal(item.definition, "정의");
});

test("더 알아보기 링크는 AI 응답이 아니라 커리큘럼 값으로 붙인다", () => {
  const withRefs = { ...CONCEPT, references: [{ title: "공식 문서", url: "https://example.com/doc" }] };
  const item = { ...knowledge(), references: [{ title: "지어낸 링크", url: "https://invented.example.com" }] };
  const normalized = normalizeBriefing(briefing({ knowledgeItems: [item] }), { concepts: [withRefs] });
  assert.deepEqual(normalized.knowledgeItems[0].references, withRefs.references);
});

test("최근에 실은 기사를 출처로 다시 쓰면 후속 표시가 있어야 한다", () => {
  const recentNews = [{ briefingDate: "2026-09-16", title: "어제 실은 뉴스", whatHappened: "…", urls: ["https://example.com/a"] }];
  const repeated = verifyBriefing(briefing({ newsItems: [news()] }), { date: DATE, concepts: [CONCEPT], recentNews });
  assert.ok(repeated.some((v) => v.code === "news.duplicate"));
  const followUp = verifyBriefing(briefing({ newsItems: [news({ followUp: "어제 실은 뉴스" })] }), { date: DATE, concepts: [CONCEPT], recentNews });
  assert.ok(!followUp.some((v) => v.code === "news.duplicate"));
});

test("날짜 표현의 숫자는 근거 검사에서 빼고, 통계 숫자는 그대로 막는다", () => {
  const candidates = [{ id: "c1", title: "t", region: "KR" as const, category: "rates" as const, importance: 9,
    sources: [{ publisher: "p", title: "기사", url: "https://example.com/a", publishedAt: FRESH }],
    facts: [{ id: "c1-f1", sourceId: "s1", quote: "위원회는 이번 회의에서 기준금리를 동결하기로 결정했다고 발표했다." }],
    documents: [{ id: "s1", requestedUrl: "https://example.com/a", source: { publisher: "p", title: "기사", url: "https://example.com/a", publishedAt: FRESH }, fetchedAt: FRESH, contentHash: "a", text: "" }] }];
  const base = { whatHappened: candidates[0].facts[0].quote, sources: candidates[0].sources, evidence: { candidateId: "c1", facts: candidates[0].facts, documents: [{ id: "s1", requestedUrl: "https://example.com/a", url: "https://example.com/a", fetchedAt: FRESH, contentHash: "a" }] } };
  const dated = verifyBriefing(briefing({ newsItems: [news({ ...base, title: "2026년 10월 16일 금리 동결", whyImportant: "3분기 흐름" })] }), { date: DATE, concepts: [CONCEPT], candidates });
  assert.ok(!dated.some((v) => v.code === "news.unsupported_number"));
  const stat = verifyBriefing(briefing({ newsItems: [news({ ...base, title: "금리 동결, 물가 3.7%" })] }), { date: DATE, concepts: [CONCEPT], candidates });
  assert.ok(stat.some((v) => v.code === "news.unsupported_number"));
});
