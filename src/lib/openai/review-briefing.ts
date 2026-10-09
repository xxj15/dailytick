import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildGroundingReviewPrompt, groundingReviewSchema } from "@/lib/news/review";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import type { DailyBriefingContent } from "@/types/briefing";

/** 의미 검토도 AI의 판단이라 완전한 진실 검증은 아니다. 기계적 원문 대조에 추가하는 발행 조건이다. */
export async function reviewBriefing(content: DailyBriefingContent, candidates: GroundedCandidate[], date: string, signal?: AbortSignal) {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildGroundingReviewPrompt(content, candidates, date),
    text: { format: zodTextFormat(groundingReviewSchema, "grounding_review") },
  }, { timeout: 60_000, maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("발행 전 근거 검토 결과가 없습니다.");
  return {
    review: groundingReviewSchema.parse(response.output_parsed),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
