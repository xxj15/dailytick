import { z } from "zod";
import { NEWS_PER_DAY, NEWS_SLOTS, TECH_NEWS_PER_DAY, TODAY_KEYWORDS_PER_DAY } from "@/config/app";

/**
 * AI 응답 검증 스키마.
 * AI 자유 텍스트를 그대로 DB에 저장하지 않는다. 항상 이 스키마를 통과한 값만 저장한다.
 */

export const newsRegionSchema = z.enum(["KR", "GLOBAL"]);

/** 주요 이슈의 자리. 오늘의 화제·국내·IT. 규칙은 config/app.ts의 NEWS_SLOTS에 있다. */
export const newsSlotSchema = z.enum(NEWS_SLOTS);

/** 주요 이슈 수집에서 훑는 다섯 섹션. 실제로 어느 섹션을 훑었는지 보고하는 단위이고, 빈 슬롯을 다시 수집할 때 겨냥하는 범위다. */
export const newsSectionSchema = z.enum(["politics", "world", "society", "economy", "tech"]);

export const newsCategorySchema = z.enum([
  "rates",
  "stocks",
  "fx",
  "macro",
  "industry",
  "policy",
  "geopolitics",
  "commodities",
  // 시사
  "politics",
  "society",
  "world",
  "science",
  // 이하 IT 파트
  "ai",
  "semiconductor",
  "software",
  "platform",
  "security",
  "other",
]);

export const newsSourceSchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  publishedAt: z.string().optional(),
});

export const marketImpactSchema = z.object({
  stocks: z.string().optional(),
  rates: z.string().optional(),
  fx: z.string().optional(),
  industry: z.string().optional(),
});

/** 과거 row에는 없으므로 newsIssueSchema의 evidence 필드만 optional이다. */
export const newsEvidenceSchema = z.object({
  candidateId: z.string().min(1),
  facts: z.array(z.object({ id: z.string(), sourceId: z.string(), quote: z.string().min(25).max(400) })).min(1).max(3),
  documents: z.array(z.object({
    id: z.string(), requestedUrl: z.url(), url: z.url(), fetchedAt: z.string(), contentHash: z.string(),
  })).min(1),
});

export const newsIssueSchema = z.object({
  rank: z.number().int().positive(),
  /** 2026-10-19 이전 row와 테크 파트 뉴스에는 없다. 없으면 지금처럼 rank 순서로만 보여준다. */
  slot: newsSlotSchema.optional(),
  title: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,

  /** 사실: 실제로 발표되거나 보도된 내용 */
  whatHappened: z.string().min(1),
  whyImportant: z.string().min(1),
  /** 어떤 영향이 있을까: 산업·경제·사회에 미칠 수 있는 영향. 2026-10-18 이전 row에는 없다. */
  impact: z.string().optional(),
  marketImpact: marketImpactSchema,

  /** 해석: 사실과 반드시 구분한다 */
  interpretation: z.string().optional(),

  sources: z.array(newsSourceSchema).min(1, "출처 없는 뉴스는 발행하지 않는다."),
  evidence: newsEvidenceSchema.optional(),

  /** 최근 며칠 안에 실은 사건의 후속이면 그 사건 제목. 새로 확인된 변화가 있을 때만 다시 싣는다. */
  followUp: z.string().optional(),
});

export const knowledgeItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: z.number().int().positive(),
  category: z.string().min(1),

  definition: z.string().min(1),
  explanation: z.string().min(1),
  example: z.string().optional(),

  /** IT 파트에서는 '실무에서 어디에 쓰이는가'를 담는다. 화면 라벨은 Why it matters로 같다. */
  securitiesPoint: z.string().min(1),
  /** 2026-10-17부터 생성하지 않는다. 그 이전 row에만 남아 있다. */
  interviewQuestion: z.string().optional(),

  keywords: z.array(z.string().min(1)),

  /** 콘텐츠 형식(개념·아티클·트렌드·실무). 서버가 선정 결과로 붙인다. 이전 row에는 없다. */
  format: z.enum(["concept", "article", "trend", "practice"]).optional(),

  /** 더 알아보기. 커리큘럼에 사람이 적어 둔 링크를 서버가 붙인다. AI 응답에서 받지 않는다. */
  references: z.array(z.object({ title: z.string().min(1), url: z.url() })).optional(),

  /**
   * 커리큘럼을 한 바퀴 돈 뒤의 복습인가.
   * AI가 정하지 않는다. 개념을 고른 코드가 저장 직전에 적어 넣는다.
   */
  review: z.boolean().optional(),
});

/** STEP 2 — Daily Briefing 생성 결과 */
export const dailyBriefingSchema = z
  .object({
    knowledgeItems: z.array(knowledgeItemSchema).min(1).max(2),
    /**
     * 하루 최대 건수(슬롯 수)는 여기서 막지 않는다. AI 출력의 required slot과 verify.ts의 슬롯 고유성 검사가 막는다.
     * 여기서 막으면 rank 없는 위반이라 마지막 시도에서 넘친 뉴스만 뺄 수 없고 그날 지면 전체가 실패한다.
     * 상한은 트림을 막지 않을 만큼 넉넉히 둔다.
     */
    newsItems: z
      .array(newsIssueSchema)
      .min(NEWS_PER_DAY.min)
      .max(NEWS_SLOTS.length * 2),
    /**
     * 오늘 지면을 여는 키워드.
     * 글자 수는 프롬프트로만 유도한다. 길이 때문에 브리핑 전체를 버리지 않는다.
     */
    todayKeywords: z
      .array(z.string().min(1))
      .min(TODAY_KEYWORDS_PER_DAY.min)
      .max(TODAY_KEYWORDS_PER_DAY.max),

    /**
     * 키워드 아래 붙는 한 줄. 왜 오늘 이 단어들이 중요한지를 설명한다.
     * 길이는 프롬프트로만 유도한다. 한두 글자 초과로 브리핑을 버리지 않는다.
     */
    oneLiner: z.string().min(1),
  });

/**
 * IT 파트. 키워드·한 줄은 경제 파트가 지면 맨 위에서 맡으므로 두지 않는다.
 * 2026-10-19부터 IT 뉴스는 '주요 이슈' 한 데스크에서 함께 고르므로 이 파트는 테크 상식만 담는다.
 * 이전 row에는 IT 뉴스가 들어 있어 newsItems를 그대로 읽는다.
 */
export const techSectionSchema = z.object({
  knowledgeItems: z.array(knowledgeItemSchema).min(1).max(2),
  newsItems: z.array(newsIssueSchema).max(TECH_NEWS_PER_DAY.max),
});

/** STEP 1 — 뉴스 후보 수집 결과 */
export const newsCandidateSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,
  section: newsSectionSchema.optional(),
  importance: z.number().int().min(1).max(10),
  sources: z.array(newsSourceSchema).min(1),
});

/** 섹션별로 실제로 검색했는가. '중요한 사건이 적은 날'과 '검색이 좁았던 날'을 가르는 근거다. */
export const newsCoverageSchema = z.array(z.object({
  section: newsSectionSchema,
  searched: z.boolean(),
  note: z.string(),
}));

export const newsCandidateListSchema = z.object({
  candidates: z.array(newsCandidateSchema),
  coverage: newsCoverageSchema.optional(),
});

/* ------------------------------------------------------------------
 * OpenAI Structured Output 전용 스키마
 *
 * strict 모드 제약이 위 canonical 스키마와 다르다.
 *   - 모든 필드가 required여야 한다. `.optional()`은 SDK가 거부하므로 `.nullable()`을 쓴다.
 *   - minItems/maximum/format 같은 제약은 지원하지 않으므로 넣지 않는다.
 *
 * 따라서 이 스키마는 "모양"만 강제하고,
 * 개수·URL 형식·국내/글로벌 균형 같은 실제 규칙은 canonical 스키마가 검증한다.
 * AI 응답은 반드시 canonical 스키마를 통과한 뒤에만 저장된다.
 * ------------------------------------------------------------------ */

const aiNewsSourceSchema = z.object({
  publisher: z.string(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string().nullable(),
});

const aiMarketImpactSchema = z.object({
  stocks: z.string().nullable(),
  rates: z.string().nullable(),
  fx: z.string().nullable(),
  industry: z.string().nullable(),
});

export const aiNewsIssueSchema = z.object({
  rank: z.number(),
  /** 새로 쓰는 기사는 반드시 슬롯 하나에 들어간다. 슬롯 규칙은 verify.ts가 검사한다. */
  slot: newsSlotSchema,
  candidateId: z.string(),
  followUp: z.string().nullable(),
  /** 검색 단계가 매긴 지역이 틀렸을 때 작성 단계에서 바로잡는다. 검토 지적을 재시도로 고칠 수 있어야 한다. */
  region: newsRegionSchema,
  factIds: z.array(z.string()),
  title: z.string(),
  whyImportant: z.string(),
  impact: z.string().nullable(),
  marketImpact: aiMarketImpactSchema,
  interpretation: z.string().nullable(),
});

const aiKnowledgeItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  level: z.number(),
  category: z.string(),
  definition: z.string(),
  explanation: z.string(),
  example: z.string().nullable(),
  securitiesPoint: z.string(),
  keywords: z.array(z.string()),
});

/** STEP 2 응답 형식 */
export const aiDailyBriefingSchema = z.object({
  knowledgeItems: z.array(aiKnowledgeItemSchema),
  newsItems: z.array(aiNewsIssueSchema),
  todayKeywords: z.array(z.string()),
  oneLiner: z.string(),
});

/** 테크 상식 작성 응답. 테크 파트는 뉴스를 쓰지 않는다. */
export const aiTechKnowledgeSchema = z.object({
  knowledgeItems: z.array(aiKnowledgeItemSchema),
});

/** 테크 상식 발굴 응답. 뉴스 후보와 같은 출처 감사를 거치도록 sources 모양을 맞춘다. */
export const aiTechTopicListSchema = z.object({
  topics: z.array(z.object({
    title: z.string(),
    summary: z.string(),
    field: z.enum(["cs", "frontend", "ai"]),
    format: z.enum(["article", "trend"]),
    learning: z.number(),
    sources: z.array(aiNewsSourceSchema),
  })),
});

/** 상식 큐레이터 응답. id는 코드가 후보 목록과 다시 대조한다. */
export const curatorSchema = z.object({
  picks: z.array(z.object({ id: z.string(), title: z.string(), reason: z.string() })),
});

/** STEP 1 응답 형식 */
export const aiNewsCandidateListSchema = z.object({
  coverage: newsCoverageSchema,
  candidates: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      region: newsRegionSchema,
      category: newsCategorySchema,
      section: newsSectionSchema,
      importance: z.number(),
      sources: z.array(aiNewsSourceSchema),
    }),
  ),
});

/**
 * structured output은 값이 없을 때 null을 쓰지만 canonical 스키마는 optional(undefined)을 쓴다.
 * 저장 전에 null을 제거한다. (null을 정상값으로 쓰는 필드는 없다)
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNulls(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null) continue;
      result[key] = stripNulls(item);
    }
    return result as T;
  }

  return value;
}
