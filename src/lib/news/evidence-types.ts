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
};

export type EvidenceRejection = { candidateId: string; url?: string; reason: string };
