import { z } from "zod";
import { NEWS_PER_DAY } from "@/config/app";

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
});

/** STEP 2 — Daily Briefing 생성 결과 */
export const dailyBriefingSchema = z
  .object({
    knowledgeItems: z.array(knowledgeItemSchema).min(1).max(2),
    newsItems: z
      .array(newsIssueSchema)
      .min(NEWS_PER_DAY.min)
      .max(NEWS_PER_DAY.max),
    oneLiner: z.string().min(1),
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
