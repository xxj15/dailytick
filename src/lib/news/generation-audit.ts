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
  /** 주요 이슈 수집이 다섯 섹션을 실제로 훑었는가. 건수가 적을 때 원인을 가른다. */
  coverage?: CoverageAudit;
  /** 상식을 어떻게 골랐는가. 큐레이터 추천·채택·탈락·대체 사유를 남긴다. */
  curation?: CurationAudit;
};

export type CoverageAudit = {
  sections: { section: string; searched: boolean; note: string }[];
  /** ok = 충분 / thin_day = 다 훑었는데 중요한 사건이 적은 날 / narrow_search = 검색 범위가 좁았던 날 */
  verdict: "ok" | "thin_day" | "narrow_search";
  recollected: boolean;
  candidates: number;
  grounded: number;
};

export type CurationAudit = {
  /** curated = 큐레이터 추천 채택 / fallback = 검증된 커리큘럼 개념으로 대체 / review = 커리큘럼 복습 / skipped = 발행 보류 */
  status: "curated" | "fallback" | "review" | "skipped";
  picks?: { id: string; title: string; reason: string }[];
  chosen?: { id: string; title: string; format: string; reason?: string };
  /** 추천됐지만 쓰지 못한 후보와 그 이유 */
  rejected?: string[];
  discovered?: number;
  error?: string;
};

export type TechAudit = Omit<GenerationAudit, "tech" | "coverage"> & {
  attempts: number;
  violations: BriefingViolation[];
  /** 실패했다면 그 사유. 이날 IT 파트 없이 발행했다는 뜻이다. */
  errorMessage?: string;
};

/**
 * cron 응답에 싣는 요약. 파트별로 단계마다 몇 건이 남았고 무엇이 왜 떨어졌는지만 보여준다.
 * DB에 들어가 보지 않고도 '왜 뉴스가 적은지'를 바로 알 수 있게 한다.
 */
export function summarizeAudit(audit: Omit<GenerationAudit, "tech"> & { errorMessage?: string; violations?: BriefingViolation[] }) {
  return {
    ...(audit.coverage ? { coverage: audit.coverage } : {}),
    ...(audit.curation ? { curation: audit.curation } : {}),
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
