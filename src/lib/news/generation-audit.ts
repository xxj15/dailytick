import type { GroundedCandidate, EvidenceRejection } from "@/lib/news/evidence-types";
import type { SearchTrace } from "@/lib/news/search-provenance";
import type { ReviewRecord } from "@/lib/openai/generate-briefing";
import type { BriefingViolation, NewsSlot } from "@/types/briefing";

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
  /**
   * 본문 근거 확인(재수집 포함)을 마친 뒤 세 슬롯을 채울 수 있는가. 빈 슬롯이 있으면 원인을 아래 순서로 가른다.
   * ok = 세 슬롯 모두 근거 있는 후보가 있다
   * sources_failed = 수집한 후보로는 채울 수 있던 빈 슬롯이 있다. 그 후보가 본문·게시일 확인에서 떨어졌다 (출처 품질 문제)
   * narrow_search = 빈 슬롯에 맞는 후보 자체가 없었고, 섹션을 덜 훑었다 (검색 범위 문제)
   * thin_day = 빈 슬롯에 맞는 후보 자체가 없었고, 섹션은 다 훑었다 (그날 사정)
   */
  verdict: "ok" | "thin_day" | "narrow_search" | "sources_failed";
  /** 빈 슬롯 때문에 재수집을 시도했는가. 실패했어도 true다. */
  recollected: boolean;
  /** 재수집을 겨냥한 슬롯. 재수집하지 않았으면 비어 있다. */
  recollectedSlots: NewsSlot[];
  /**
   * 재수집(수집 또는 근거 확인)이 실패했거나 끝까지 하지 못한 이유. 재수집 시간 예산 초과, 근거 확인할 시간 부족도 여기 남는다.
   * 실패해도 1차 결과로 발행한다. 성공했거나 재수집하지 않았으면 없다.
   */
  recollectError?: string;
  /**
   * 1차 수집의 슬롯별 호출 결과(슬롯 순서). 1차 수집은 슬롯마다 따로 돌고, 일부가 실패해도 나머지 슬롯 후보로 진행한다.
   * 셋 다 실패하면 수집 실패로 멈추므로 이 기록까지 오지 않는다(이유는 오류 메시지에 남는다).
   */
  firstPass: SlotCollectAudit[];
  candidates: number;
  grounded: number;
  /** 슬롯별 결과. 어떤 슬롯이 왜 비었는지 여기서 본다. */
  slots: SlotAudit[];
};

export type SlotCollectAudit = {
  slot: NewsSlot;
  /** 그 호출이 낸 후보 수. 다른 슬롯 호출과 겹쳐 합칠 때 빠진 후보도 센다. 실패했으면 0이다. */
  candidates: number;
  /** 실패했다면 그 이유. 시간 초과로 다시 시도했으면 마지막 시도 기준이다. */
  error?: string;
};

export type SlotAudit = {
  slot: NewsSlot;
  /** 수집한 후보 가운데 이 슬롯에 맞는 수 */
  candidates: number;
  /** 그중 본문 근거가 확인된 수 */
  grounded: number;
  /** 발행 결과. 작성·검토 전에 멈췄거나 작성·검토가 실패해 발행하지 않았으면 없다. 마지막 시도에서 빠진 슬롯도 empty다. */
  status?: "filled" | "empty";
  /** filled면 발행한 rank, empty면 비운 이유 */
  rank?: number;
  reason?: string;
};

export type CurationAudit = {
  /**
   * curated = 큐레이터 추천을 하나 이상 채택(모자란 자리는 대체로 채웠을 수 있다) / fallback = 추천을 하나도 못 써 검증된 커리큘럼 개념으로 대체
   * review = 커리큘럼 복습(미학습 후보가 없었거나, 추천을 못 써 복습 개념으로만 채웠다) / skipped = 발행 보류
   */
  status: "curated" | "fallback" | "review" | "skipped";
  picks?: { id: string; title: string; reason: string }[];
  /**
   * 고른 상식. 지면 순서다. 테크 상식은 하루 여러 개라 배열로 남긴다.
   * status가 curated여도 추천으로 못 채운 자리를 대체(커리큘럼 개념)로 채운 항목이 뒤에 올 수 있다. 그 항목은 fallback이다.
   * review는 커리큘럼을 다 돌아 복습으로 고른 항목이다.
   */
  chosen?: { id: string; title: string; format: string; category: string; reason?: string; fallback?: true; review?: true }[];
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
  /**
   * 여러 상식을 함께 쓰지 못해 항목을 줄였다.
   * - 함께 작성·검토할 테크 시간이 처음부터 모자랐다면 error가 그 사유이고, 첫 항목만 썼다.
   * - 함께 쓰다 최종 실패했다면 error·violations가 그 실패다. retries는 줄여서 다시 쓴 시도(실패한 시도는 error)이고,
   *   skipped는 남은 테크 시간이 모자라 다시 쓰지 않은 사유다.
   * dropped는 마지막으로 쓴 항목에 들지 않은 상식 slug다(다시 쓰지 못했으면 전부).
   * attempts·violations·reviews는 마지막으로 쓴 생성의 기록이다.
   */
  narrowed?: {
    dropped: string[];
    error: string;
    violations: BriefingViolation[];
    retries?: { slugs: string[]; error?: string }[];
    skipped?: string;
  };
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
