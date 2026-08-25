import type { z } from "zod";
import type {
  dailyBriefingSchema,
  knowledgeItemSchema,
  marketImpactSchema,
  newsCandidateSchema,
  newsCategorySchema,
  newsIssueSchema,
  newsRegionSchema,
  newsSourceSchema,
} from "@/lib/openai/schemas";

/** 타입의 단일 출처는 Zod 스키마다. 스키마를 고치면 타입이 따라온다. */
export type NewsRegion = z.infer<typeof newsRegionSchema>;
export type NewsCategory = z.infer<typeof newsCategorySchema>;
export type NewsSource = z.infer<typeof newsSourceSchema>;
export type MarketImpact = z.infer<typeof marketImpactSchema>;
export type NewsIssue = z.infer<typeof newsIssueSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type NewsCandidate = z.infer<typeof newsCandidateSchema>;

/** AI가 생성한 브리핑 본문 (DB 저장 전) */
export type DailyBriefingContent = z.infer<typeof dailyBriefingSchema>;

/** DB에 저장된 브리핑 한 건 */
export type Briefing = DailyBriefingContent & {
  id: string;
  briefingDate: string;
  generatedAt: string;
  model: string | null;
  promptVersion: string | null;
};

/** briefings 테이블 row (snake_case) */
export type BriefingRow = {
  id: string;
  briefing_date: string;
  knowledge_items: KnowledgeItem[];
  news_items: NewsIssue[];
  one_liner: string;
  generated_at: string;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationStatus = "running" | "success" | "failed";
