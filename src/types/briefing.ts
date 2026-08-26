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
  /** 키워드 도입 이전에 저장된 row는 비어 있다. */
  today_keywords: string[] | null;
  generated_at: string;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
};

/** Archive 목록 한 줄. 본문 전체를 읽지 않는다. */
export type ArchiveEntry = {
  briefingDate: string;
  knowledgeTitles: string[];
};

/** 학습 이력 한 줄. 개념 중복 판정과 복습 순번에만 쓴다. */
export type ConceptHistoryEntry = {
  briefingDate: string;
  items: { slug: string; title: string }[];
};

/** 하루치 학습 기록 (완료 여부 + 메모) */
export type StudyLog = {
  briefingDate: string;
  completedAt: string | null;
  note: string | null;
};

/** study_logs 테이블 row (snake_case) */
export type StudyLogRow = {
  briefing_date: string;
  completed_at: string | null;
  note: string | null;
};

export type GenerationStatus = "running" | "success" | "failed";
