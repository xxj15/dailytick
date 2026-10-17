import type { GroundedCandidate, EvidenceRejection } from "@/lib/news/evidence-types";
import type { SearchTrace } from "@/lib/news/search-provenance";
import type { ReviewRecord } from "@/lib/openai/generate-briefing";
import type { BriefingViolation } from "@/types/briefing";

export type GenerationAudit = {
  stage: "history" | "search" | "sources" | "generation" | "save" | "complete";
  searchTrace: SearchTrace[];
  rejectedUrls: string[];
  sourceRejections: EvidenceRejection[];
  evidence: { candidateId: string; facts: GroundedCandidate["facts"]; documents: Omit<GroundedCandidate["documents"][number], "text">[] }[];
  reviews: ReviewRecord[];
  /** IT 파트는 경제 파트와 따로 성패가 갈리므로 위반·실패 사유를 자기 안에 둔다. */
  tech?: TechAudit;
  /** Tech·경제 키워드 합성이 실패해 경제 키워드를 그대로 쓴 경우 그 사유 */
  headlineError?: string;
};

export type TechAudit = Omit<GenerationAudit, "tech" | "headlineError"> & {
  attempts: number;
  violations: BriefingViolation[];
  /** 실패했다면 그 사유. 이날 IT 파트 없이 발행했다는 뜻이다. */
  errorMessage?: string;
};

/** 원문 전체 대신 채택한 짧은 근거·URL·수집 시각·hash를 남긴다. */
export function auditEvidence(candidates: GroundedCandidate[]): GenerationAudit["evidence"] {
  return candidates.map((candidate) => ({
    candidateId: candidate.id,
    facts: candidate.facts,
    documents: candidate.documents.map((doc) => ({
      id: doc.id, requestedUrl: doc.requestedUrl, source: doc.source, fetchedAt: doc.fetchedAt, contentHash: doc.contentHash,
    })),
  }));
}
