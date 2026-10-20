import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { getModel, getOpenAI, LIGHT_REASONING, timeoutForItems } from "@/lib/openai/client";
import { buildGroundingReviewPrompt, groundingReviewSchema } from "@/lib/news/review";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import type { GroundedSection, RecentNewsEntry } from "@/types/briefing";

/**
 * 의미 검토도 AI의 판단이라 완전한 진실 검증은 아니다. 기계적 원문 대조에 추가하는 발행 조건이다.
 * 제한 시간은 검토할 상식 항목 수에 맞춘다(테크 상식은 하루 여러 항목을 한 번에 검토한다).
 */
export async function reviewBriefing(content: GroundedSection, candidates: GroundedCandidate[], date: string, signal?: AbortSignal, recentNews: RecentNewsEntry[] = []) {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildGroundingReviewPrompt(content, candidates, date, recentNews),
    reasoning: LIGHT_REASONING,
    text: { format: zodTextFormat(groundingReviewSchema, "grounding_review") },
  }, { timeout: timeoutForItems(content.knowledgeItems.length), maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("발행 전 근거 검토 결과가 없습니다.");
  return {
    review: groundingReviewSchema.parse(response.output_parsed),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
