import type { z } from "zod";
import type { aiDailyBriefingSchema } from "@/lib/openai/schemas";
import type { GroundedCandidate } from "@/lib/news/evidence-types";

/** 사실 본문·출처·게시일은 모델이 작성하지 않는다. 서버가 검증된 자료에서 조합한다. */
export function materializeBriefing(draft: z.infer<typeof aiDailyBriefingSchema>, candidates: GroundedCandidate[]) {
  const seen = new Set<string>();
  return {
    ...draft,
    newsItems: draft.newsItems.map((item) => {
      const candidate = candidates.find((entry) => entry.id === item.candidateId);
      if (!candidate || seen.has(candidate.id)) throw new Error(`존재하지 않거나 중복된 후보: ${item.candidateId}`);
      seen.add(candidate.id);
      if (!item.factIds.length || item.factIds.length > 3 || new Set(item.factIds).size !== item.factIds.length) {
        throw new Error(`유효한 사실 ID를 1~3개 선택해야 합니다: ${item.candidateId}`);
      }
      const facts = item.factIds.map((id) => {
        const fact = candidate.facts.find((entry) => entry.id === id);
        const doc = candidate.documents.find((entry) => entry.id === fact?.sourceId);
        if (!fact || !doc || !doc.text.includes(fact.quote)) throw new Error(`원문으로 확인할 수 없는 사실 ID: ${id}`);
        return fact;
      });
      const documents = candidate.documents.filter((doc) => facts.some((fact) => fact.sourceId === doc.id));
      return {
        rank: item.rank, title: item.title, region: candidate.region, category: candidate.category,
        whatHappened: facts.map((fact) => fact.quote).join(" "),
        whyImportant: item.whyImportant, marketImpact: item.marketImpact, interpretation: item.interpretation,
        sources: documents.map((doc) => doc.source),
        evidence: {
          candidateId: candidate.id, facts,
          documents: documents.map((doc) => ({
            id: doc.id, requestedUrl: doc.requestedUrl, url: doc.source.url, fetchedAt: doc.fetchedAt, contentHash: doc.contentHash,
          })),
        },
      };
    }),
  };
}
