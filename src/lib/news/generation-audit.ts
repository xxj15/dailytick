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

/**
 * cron 응답에 싣는 요약. 파트별로 단계마다 몇 건이 남았고 무엇이 왜 떨어졌는지만 보여준다.
 * DB에 들어가 보지 않고도 '왜 뉴스가 적은지'를 바로 알 수 있게 한다.
 */
export function summarizeAudit(audit: Omit<GenerationAudit, "tech" | "headlineError"> & { errorMessage?: string; violations?: BriefingViolation[] }) {
  return {
    stage: audit.stage,
    searches: audit.searchTrace.filter((call) => call.action === "search").length,
    rejectedUrls: audit.rejectedUrls.length,
    grounded: audit.evidence.length,
    sourceRejections: audit.sourceRejections.map((item) => `${item.candidateId}: ${item.reason}${item.url ? ` (${item.url})` : ""}`),
    reviews: audit.reviews.map((record) => record.review.news.filter((news) => !news.supported).map((news) => news.reason)).flat(),
    ...(audit.violations?.length ? { violations: audit.violations.map((item) => `${item.code}: ${item.message}`.slice(0, 200)) } : {}),
    ...(audit.errorMessage ? { error: audit.errorMessage } : {}),
  };
}

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
