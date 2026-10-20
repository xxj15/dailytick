import type { NewsCandidate, NewsSource } from "@/types/briefing";

export type SourceDocument = {
  id: string;
  requestedUrl: string;
  source: NewsSource;
  fetchedAt: string;
  contentHash: string;
  text: string;
};

/**
 * 근거 문장의 역할. 주요 이슈는 무슨 일(event)과 그 원인·배경(background)을 각각 본문 문장으로 확인한다(2026-10-20).
 * 이 구분 전 기록과 테크 상식 원문에는 없다. 없으면 무슨 일(event)로 본다.
 */
export type FactRole = "event" | "background";

export type EvidenceFact = {
  id: string;
  sourceId: string;
  /** 실제 본문에 있는 연속된 문장. AI의 바꿔 쓰기는 허용하지 않는다. */
  quote: string;
  role?: FactRole;
};

/** 원인·배경 문장인가. 역할이 없는 문장(예전 기록·테크 원문)은 무슨 일이다. */
export function isBackground(fact: Pick<EvidenceFact, "role">): boolean {
  return fact.role === "background";
}

export type GroundedCandidate = Omit<NewsCandidate, "summary"> & {
  id: string;
  facts: EvidenceFact[];
  documents: SourceDocument[];
  /**
   * 테크 상식 원문에만 있다. 이 원문이 근거인 상식의 slug.
   * 하루 상식이 여러 개면 작성·검토가 항목마다 자기 원문만 보도록 이 값으로 가른다.
   */
  knowledgeSlug?: string;
};

export type EvidenceRejection = { candidateId: string; url?: string; reason: string };
