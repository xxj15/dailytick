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

test("국내 뉴스를 앞에 두고 rank를 다시 매긴다", () => {
  const normalized = normalizeBriefing(
    briefing({
      newsItems: [
        news({ rank: 1, title: "글로벌", region: "GLOBAL" }),
        news({ rank: 2, title: "국내 2위", region: "KR" }),
        news({ rank: 3, title: "국내 3위", region: "KR" }),
      ],
    }),
    { concepts: [CONCEPT] },
  );

  assert.deepEqual(
    normalized.newsItems.map((n) => [n.rank, n.title]),
    [
      [1, "국내 2위"],
      [2, "국내 3위"],
      [3, "글로벌"],
    ],
  );
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
