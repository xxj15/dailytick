import { z } from "zod";
import { NEWS_PER_DAY, TODAY_KEYWORDS_PER_DAY } from "@/config/app";

/**
 * AI 응답 검증 스키마.
 * AI 자유 텍스트를 그대로 DB에 저장하지 않는다. 항상 이 스키마를 통과한 값만 저장한다.
 */

export const newsRegionSchema = z.enum(["KR", "GLOBAL"]);

export const newsCategorySchema = z.enum([
  "rates",
  "stocks",
  "fx",
  "macro",
  "industry",
  "policy",
  "geopolitics",
  "commodities",
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

export const newsIssueSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,

  /** 사실: 실제로 발표되거나 보도된 내용 */
  whatHappened: z.string().min(1),
  whyImportant: z.string().min(1),
  marketImpact: marketImpactSchema,

  /** 해석: 사실과 반드시 구분한다 */
  interpretation: z.string().optional(),

  sources: z.array(newsSourceSchema).min(1, "출처 없는 뉴스는 발행하지 않는다."),
});

export const knowledgeItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: z.number().int().positive(),
  category: z.string().min(1),

  definition: z.string().min(1),
  explanation: z.string().min(1),
  example: z.string().optional(),

  securitiesPoint: z.string().min(1),
  interviewQuestion: z.string().min(1),

  keywords: z.array(z.string().min(1)),

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
    newsItems: z
      .array(newsIssueSchema)
      .min(NEWS_PER_DAY.min)
      .max(NEWS_PER_DAY.max),
    /**
     * 오늘 지면을 여는 키워드.
     * 글자 수는 프롬프트로만 유도한다. 길이 때문에 브리핑 전체를 버리지 않는다.
     */
    todayKeywords: z
      .array(z.string().min(1))
      .min(TODAY_KEYWORDS_PER_DAY.min)
      .max(TODAY_KEYWORDS_PER_DAY.max),
  })
  .refine((b) => b.newsItems.some((n) => n.region === "KR"), {
    message: "국내 뉴스가 최소 1개 필요합니다.",
    path: ["newsItems"],
  })
  .refine((b) => b.newsItems.some((n) => n.region === "GLOBAL"), {
    message: "글로벌 뉴스가 최소 1개 필요합니다.",
    path: ["newsItems"],
  });

/** STEP 1 — 뉴스 후보 수집 결과 */
export const newsCandidateSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,
  importance: z.number().int().min(1).max(10),
  sources: z.array(newsSourceSchema).min(1),
});

export const newsCandidateListSchema = z.object({
  candidates: z.array(newsCandidateSchema),
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

const aiNewsIssueSchema = z.object({
  rank: z.number(),
  title: z.string(),
  region: newsRegionSchema,
  category: newsCategorySchema,
  whatHappened: z.string(),
  whyImportant: z.string(),
  marketImpact: aiMarketImpactSchema,
  interpretation: z.string().nullable(),
  sources: z.array(aiNewsSourceSchema),
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
  interviewQuestion: z.string(),
  keywords: z.array(z.string()),
});

/** STEP 2 응답 형식 */
export const aiDailyBriefingSchema = z.object({
  knowledgeItems: z.array(aiKnowledgeItemSchema),
  newsItems: z.array(aiNewsIssueSchema),
  todayKeywords: z.array(z.string()),
});

/** STEP 1 응답 형식 */
export const aiNewsCandidateListSchema = z.object({
  candidates: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      region: newsRegionSchema,
      category: newsCategorySchema,
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
