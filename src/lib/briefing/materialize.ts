import type { z } from "zod";
import type { aiNewsIssueSchema } from "@/lib/openai/schemas";
import { isBackground, type GroundedCandidate } from "@/lib/news/evidence-types";
import { MAX_FACTS } from "@/lib/news/ground-candidates";
import { slotOrder } from "@/lib/news/slots";

/**
 * 사실 본문·출처·게시일은 모델이 작성하지 않는다. 서버가 검증된 자료에서 조합한다.
 * 핵심 요약은 무슨 일(event) 근거 문장(whatHappened)과 원인·배경(background) 근거 문장을 그대로 잇는다.
 * 후보에 원인·배경 문장이 있으면 그중 하나를 골라야 한다. 원인이 확인된 기사를 수치만 전하는 요약으로 만들지 않는다.
 * 같은 후보를 두 슬롯에 쓴 경우는 여기서 막지 않는다. verify.ts가 그 뉴스 rank를 가리켜 걸러야
 * 재시도와 마지막 시도의 트림(그 뉴스만 빼고 발행)을 탈 수 있다.
 *
 * rank는 서버가 다시 매긴다. 슬롯 순서(주요 시사 → 경제 → IT), 같은 슬롯 안에서는 AI가 적은 rank 순서(같으면 쓴 순서)로
 * 놓고 1부터 매긴다. AI rank는 겹칠 수 있는데, verify·검토·트림은 rank로 기사를 가리키므로 기사마다 rank가 달라야
 * 걸린 기사 한 건만 빠진다.
 */
export function materializeBriefing<D extends { newsItems: z.infer<typeof aiNewsIssueSchema>[] }>(draft: D, candidates: GroundedCandidate[]) {
  const ordered = draft.newsItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => slotOrder(a.item.slot) - slotOrder(b.item.slot) || a.item.rank - b.item.rank || a.index - b.index)
    .map(({ item }, index) => ({ ...item, rank: index + 1 }));
  return {
    ...draft,
    newsItems: ordered.map((item) => {
      const candidate = candidates.find((entry) => entry.id === item.candidateId);
      if (!candidate) throw new Error(`존재하지 않는 후보: ${item.candidateId}`);
      if (!item.factIds.length || item.factIds.length > MAX_FACTS || new Set(item.factIds).size !== item.factIds.length) {
        throw new Error(`유효한 사실 ID를 1~${MAX_FACTS}개 선택해야 합니다: ${item.candidateId}`);
      }
      const facts = item.factIds.map((id) => {
        const fact = candidate.facts.find((entry) => entry.id === id);
        const doc = candidate.documents.find((entry) => entry.id === fact?.sourceId);
        if (!fact || !doc || !doc.text.includes(fact.quote)) throw new Error(`원문으로 확인할 수 없는 사실 ID: ${id}`);
        return fact;
      });
      const events = facts.filter((fact) => !isBackground(fact));
      const backgrounds = facts.filter(isBackground);
      if (!events.length) throw new Error(`무슨 일(event) 근거 문장을 하나 이상 골라야 합니다: ${item.candidateId}`);
      if (!backgrounds.length && candidate.facts.some(isBackground)) {
        throw new Error(`원인·배경(background) 근거 문장을 하나 이상 골라야 합니다: ${item.candidateId}`);
      }
      const documents = candidate.documents.filter((doc) => facts.some((fact) => fact.sourceId === doc.id));
      return {
        rank: item.rank, slot: item.slot, title: item.title, region: item.region, category: candidate.category, followUp: item.followUp,
        whatHappened: events.map((fact) => fact.quote).join(" "),
        ...(backgrounds.length ? { background: backgrounds.map((fact) => fact.quote).join(" ") } : {}),
        // 2026-10-20부터 기사는 핵심 요약과 왜 읽을 만한가만 쓴다. 시장 영향은 저장 모양을 지키려 빈 값으로 둔다
        whyImportant: item.whyImportant, marketImpact: {},
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
