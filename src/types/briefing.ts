import type { z } from "zod";
import type {
  dailyBriefingSchema,
  knowledgeItemSchema,
  marketImpactSchema,
  newsCandidateSchema,
  newsCategorySchema,
  newsCoverageSchema,
  newsIssueSchema,
  newsRegionSchema,
  newsSlotSchema,
  newsSourceSchema,
  storedNewsSlotSchema,
  techSectionSchema,
} from "@/lib/openai/schemas";

/** 타입의 단일 출처는 Zod 스키마다. 스키마를 고치면 타입이 따라온다. */
export type NewsRegion = z.infer<typeof newsRegionSchema>;
export type NewsSlot = z.infer<typeof newsSlotSchema>;
/** 저장된 기사의 자리. 예전 슬롯(domestic)을 포함한다. */
export type StoredNewsSlot = z.infer<typeof storedNewsSlotSchema>;
export type NewsCategory = z.infer<typeof newsCategorySchema>;
export type NewsSource = z.infer<typeof newsSourceSchema>;
export type MarketImpact = z.infer<typeof marketImpactSchema>;
export type NewsIssue = z.infer<typeof newsIssueSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type NewsCandidate = z.infer<typeof newsCandidateSchema>;
export type NewsCoverage = z.infer<typeof newsCoverageSchema>;

/** AI가 생성한 브리핑 본문 (DB 저장 전) */
export type DailyBriefingContent = z.infer<typeof dailyBriefingSchema>;

/** IT 파트 (개념 + 뉴스) */
export type TechSection = z.infer<typeof techSectionSchema>;

/** 근거 검증·의미 검토를 거치는 단위. 경제 본문과 IT 파트가 같은 모양을 공유한다. */
export type GroundedSection = Pick<DailyBriefingContent, "knowledgeItems" | "newsItems">;

/** DB에 저장된 브리핑 한 건 */
export type Briefing = DailyBriefingContent & {
  /** IT 파트 도입 이전이거나 그날 IT 파트 생성에 실패했으면 null. */
  tech: TechSection | null;
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
  one_liner: string | null;
  /** IT 파트가 없는 날은 둘 다 null이다. */
  tech_knowledge_items: KnowledgeItem[] | null;
  tech_news_items: NewsIssue[] | null;
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

/** 최근 며칠 동안 실은 뉴스. 같은 사건을 반복해 싣지 않도록 수집·작성·검토에 함께 넘긴다. */
export type RecentNewsEntry = {
  briefingDate: string;
  title: string;
  whatHappened: string;
  urls: string[];
};

/** 상식 모아보기 한 줄. 배운 날짜로 돌아갈 수 있게 날짜를 함께 둔다. */
export type KnowledgeArchiveEntry = {
  briefingDate: string;
  slug: string;
  title: string;
  category: string;
  review: boolean;
};

/** 학습 이력 한 줄. 개념 중복 판정과 복습 순번에만 쓴다. */
export type ConceptHistoryEntry = {
  briefingDate: string;
  /** category·format·level은 최근 며칠의 분야·형식·난이도를 보고 고르는 데 쓴다. 이전 row에는 format이 없다. */
  items: { slug: string; title: string; category?: string; format?: string; level?: number; url?: string }[];
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

/**
 * 검증에 걸린 사례 한 건.
 * 재시도로 성공한 1차 위반도 남긴다. 성공한 결과만 보면 무엇을 고쳐야 할지 알 수 없다.
 */
export type BriefingViolation = {
  attempt: number;
  /** 집계용 분류. 예: "news.freshness", "knowledge.slug", "schema.newsItems" */
  code: string;
  message: string;
  /** 특정 뉴스 하나에 대한 위반이면 그 뉴스의 rank. 마지막 시도에서 그 뉴스만 빼고 발행할 수 있는지 판단한다. */
  rank?: number;
};
