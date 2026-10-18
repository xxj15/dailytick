import "server-only";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildNewsCollectionPrompt, buildTechDiscoveryPrompt } from "@/lib/openai/prompts";
import {
  aiNewsCandidateListSchema,
  aiTechTopicListSchema,
  newsCandidateListSchema,
  newsCandidateSchema,
  stripNulls,
} from "@/lib/openai/schemas";
import type { DateString } from "@/lib/date";
import type { NewsCandidate, NewsCoverage } from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";
import { auditSearchResults, searchTraceFromCalls, SearchAuditError, type SearchTrace } from "@/lib/news/search-provenance";

export class NewsCollectionError extends Error {
  constructor(message: string, readonly usage: { inputTokens: number; outputTokens: number; webSearchCalls: number }, readonly trace: SearchTrace[], readonly rejectedUrls: string[] = []) {
    super(message);
  }
}

export type CollectNewsResult = {
  candidates: NewsCandidate[];
  /** 섹션별 검색 여부. 주요 이슈 데스크만 채운다. */
  coverage?: NewsCoverage;
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
export function collectMarketNews(
  date: DateString,
  signal?: AbortSignal,
  options: Parameters<typeof buildNewsCollectionPrompt>[1] = {},
) {
  return collectNews(buildNewsCollectionPrompt(date, options), signal);
}

/**
 * 웹 검색을 여러 번 하는 단계라 다른 AI 호출보다 기한을 길게 준다.
 * 경제·IT가 동시에 돌기 때문에 전체 실행 기한(260초) 안에서 여유가 있다.
 */
async function collectNews(
  input: string,
  signal?: AbortSignal,
): Promise<CollectNewsResult> {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input,
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: {
      format: zodTextFormat(aiNewsCandidateListSchema, "news_candidates"),
    },
  }, { timeout: 90_000, maxRetries: 0, signal });

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
    coverage: parsed.data.coverage,
    searchTrace: audited.trace,
    rejectedUrls: audited.rejectedUrls,
    ...usage,
  };
}

/** 그날 검색으로 찾은 테크 상식 후보. candidate는 근거 확인 파이프라인에 그대로 넘길 수 있는 모양이다. */
export type TechTopic = {
  title: string;
  summary: string;
  field: "cs" | "frontend" | "ai";
  format: "article" | "trend";
  learning: number;
  candidate: NewsCandidate;
};

/**
 * 테크 상식 발굴. 뉴스 수집과 같은 방식으로 웹 검색을 하고, 실제 검색 결과에 나온 URL만 남긴다.
 * 찾은 글은 큐레이터 후보일 뿐이다. 고른 뒤에 서버가 원문을 읽어 근거를 확인한다.
 */
export async function discoverTechTopics(
  date: DateString,
  signal?: AbortSignal,
  options: Parameters<typeof buildTechDiscoveryPrompt>[1] = {},
) {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildTechDiscoveryPrompt(date, options),
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: { format: zodTextFormat(aiTechTopicListSchema, "tech_topics") },
  }, { timeout: 90_000, maxRetries: 0, signal });

  const calls = response.output.filter((item) => item.type === "web_search_call");
  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    webSearchCalls: calls.filter((call) => call.action.type === "search").length,
  };
  const trace = searchTraceFromCalls(calls);
  if (!response.output_parsed) throw new NewsCollectionError("테크 상식 발굴 실패: 구조화된 응답을 받지 못했습니다.", usage, trace);

  const topics = response.output_parsed.topics.flatMap((topic) => {
    const candidate = newsCandidateSchema.safeParse(stripNulls({
      title: topic.title,
      summary: topic.summary,
      region: "GLOBAL",
      category: topic.field === "ai" ? "ai" : "software",
      importance: Math.min(10, Math.max(1, Math.round(topic.learning))),
      sources: topic.sources,
    }));
    return candidate.success ? [{ ...topic, candidate: candidate.data }] : [];
  });

  // 검색에 실제로 나온 URL만 남긴다. 하나도 없으면 발굴 후보 없이 커리큘럼·아티클 후보로만 고른다.
  let kept: TechTopic[] = [];
  let rejectedUrls: string[] = [];
  try {
    const audited = auditSearchResults(topics.map((topic) => topic.candidate), calls);
    rejectedUrls = audited.rejectedUrls;
    kept = audited.candidates.flatMap((candidate) => {
      const topic = topics.find((entry) => entry.candidate.title === candidate.title);
      return topic ? [{ ...topic, candidate }] : [];
    });
  } catch (error) {
    if (!(error instanceof SearchAuditError)) throw error;
    rejectedUrls = error.rejectedUrls;
  }
  return { topics: kept, searchTrace: trace, rejectedUrls, ...usage };
}
