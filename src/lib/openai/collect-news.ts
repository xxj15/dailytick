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
import { auditSearchResults, searchTraceFromCalls, SearchAuditError, type SearchTrace } from "@/lib/news/search-provenance";

export class NewsCollectionError extends Error {
  constructor(message: string, readonly usage: { inputTokens: number; outputTokens: number; webSearchCalls: number }, readonly trace: SearchTrace[], readonly rejectedUrls: string[] = []) {
    super(message);
  }
}

export type CollectNewsResult = {
  candidates: NewsCandidate[];
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  searchTrace: SearchTrace[];
  rejectedUrls: string[];
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
  signal?: AbortSignal,
): Promise<CollectNewsResult> {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildNewsCollectionPrompt(date),
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: {
      format: zodTextFormat(aiNewsCandidateListSchema, "news_candidates"),
    },
  }, { timeout: 60_000, maxRetries: 0, signal });

  const calls = response.output.filter((item) => item.type === "web_search_call");
  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    webSearchCalls: calls.filter((call) => call.action.type === "search").length,
  };
  const trace = searchTraceFromCalls(calls);

  if (!response.output_parsed) {
    throw new NewsCollectionError("뉴스 후보 수집 실패: 구조화된 응답을 받지 못했습니다.", usage, trace);
  }

  // AI 응답의 null을 걷어낸 뒤 canonical 스키마로 다시 검증한다.
  const parsed = newsCandidateListSchema.safeParse(
    stripNulls(response.output_parsed),
  );

  if (!parsed.success) {
    throw new NewsCollectionError(
      `뉴스 후보 검증 실패: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`, usage, trace,
    );
  }

  let audited;
  try {
    audited = auditSearchResults(parsed.data.candidates, calls);
  } catch (error) {
    if (error instanceof SearchAuditError) throw new NewsCollectionError(error.message, usage, error.trace, error.rejectedUrls);
    throw error;
  }

  return {
    candidates: audited.candidates,
    searchTrace: audited.trace,
    rejectedUrls: audited.rejectedUrls,
    ...usage,
  };
}
