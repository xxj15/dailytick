import type { NewsCandidate, NewsSource } from "@/types/briefing";

export type SourceDocument = {
  id: string;
  requestedUrl: string;
  source: NewsSource;
  fetchedAt: string;
  contentHash: string;
  text: string;
};

export type EvidenceFact = {
  id: string;
  sourceId: string;
  /** 실제 본문에 있는 연속된 문장. AI의 바꿔 쓰기는 허용하지 않는다. */
  quote: string;
};

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
