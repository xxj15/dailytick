import "server-only";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildNewsCollectionPrompt } from "@/lib/openai/prompts";
import {
  aiNewsCandidateListSchema,
  newsCandidateListSchema,
  stripNulls,
} from "@/lib/openai/schemas";
import type { DateString } from "@/lib/date";
import type { NewsCandidate } from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";

export type CollectNewsResult = {
  candidates: NewsCandidate[];
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

/**
 * STEP 1 — 최신 뉴스 수집.
 *
 * OpenAI Responses API의 web_search tool로 최근 24시간 주요 경제 이슈 후보를 찾는다.
 * 이 단계는 후보를 모으기만 한다. 긴 설명은 STEP 2에서 작성한다.
 *
 * 별도 뉴스 API를 쓰지 않지만, 나중에 교체할 수 있도록 이 함수만 바꾸면 되게 분리해 둔다.
 */
export async function collectMarketNews(
  date: DateString,
): Promise<CollectNewsResult> {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildNewsCollectionPrompt(date),
    tools: [{ type: "web_search" }],
    text: {
      format: zodTextFormat(aiNewsCandidateListSchema, "news_candidates"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("뉴스 후보 수집 실패: 구조화된 응답을 받지 못했습니다.");
  }

  // AI 응답의 null을 걷어낸 뒤 canonical 스키마로 다시 검증한다.
  const parsed = newsCandidateListSchema.safeParse(
    stripNulls(response.output_parsed),
  );

  if (!parsed.success) {
    throw new Error(
      `뉴스 후보 검증 실패: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  }

  return {
    candidates: parsed.data.candidates,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    webSearchCalls: response.output.filter(
      (item) => item.type === "web_search_call",
    ).length,
  };
}
