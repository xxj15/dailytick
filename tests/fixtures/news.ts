import type { z } from "zod";
import type { CurriculumConcept } from "@/data/curriculum";
import type { aiDailyBriefingSchema } from "@/lib/openai/schemas";
import type { GroundedCandidate } from "@/lib/news/evidence-types";

export const DATE = "2026-10-09";
export const CONCEPT: CurriculumConcept = { slug: "base-rate", title: "기준금리", level: 3, category: "rates-bonds" };
export const QUOTE = "위원회는 이번 회의에서 기준금리를 동결하기로 결정했다고 발표했다.";
export const CANDIDATE: GroundedCandidate = {
  id: "c1", title: "기준금리 동결", region: "KR", category: "rates", importance: 9,
  sources: [{ publisher: "공식 기관", title: "통화정책 결정", url: "https://example.com/release", publishedAt: "2026-10-09T07:00:00+09:00" }],
  facts: [{ id: "c1-f1", sourceId: "s1", quote: QUOTE }],
  documents: [{
    id: "s1", requestedUrl: "https://example.com/release",
    source: { publisher: "공식 기관", title: "통화정책 결정", url: "https://example.com/release", publishedAt: "2026-10-09T07:00:00+09:00" },
    fetchedAt: "2026-10-09T08:00:00+09:00", contentHash: "a".repeat(64), text: `${QUOTE} 향후 정책은 경기와 물가 흐름에 따라 달라질 수 있다고 설명했다.`,
  }],
};
export const DRAFT: z.infer<typeof aiDailyBriefingSchema> = {
  knowledgeItems: [{ ...CONCEPT, definition: "정의", explanation: "설명", example: null, securitiesPoint: "업무 연결", interviewQuestion: "질문", keywords: ["금리"] }],
  newsItems: [{ rank: 1, candidateId: "c1", factIds: ["c1-f1"], title: "기준금리 동결", whyImportant: "차입 비용을 이해하는 기준이 될 수 있다.", marketImpact: { stocks: null, rates: "경기와 물가 흐름에 따라 시장금리 기대가 달라질 수 있다.", fx: null, industry: null }, interpretation: null }],
  todayKeywords: ["기준금리", "통화정책", "금융시장"], oneLiner: "기준금리 동결의 의미를 살펴봅니다.",
};
