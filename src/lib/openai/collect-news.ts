import "server-only";
import { NEWS_SELECT_TIMEOUT_MS } from "@/config/app";
import { getModel, getOpenAI, LIGHT_REASONING } from "@/lib/openai/client";
import { buildNewsSelectionPrompt, buildTechDiscoveryPrompt } from "@/lib/openai/prompts";
import {
  aiNewsSelectionSchema,
  aiTechTopicListSchema,
  newsCandidateSchema,
  stripNulls,
} from "@/lib/openai/schemas";
import type { DateString } from "@/lib/date";
import { candidatesFromPicks, collectFeedItems, type FeedItem, type FeedResult } from "@/lib/news/rss";
import type { NewsCandidate, RecentNewsEntry } from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";
import { auditSearchResults, searchTraceFromCalls, SearchAuditError, type SearchTrace } from "@/lib/news/search-provenance";

export class NewsCollectionError extends Error {
  constructor(message: string, readonly usage: { inputTokens: number; outputTokens: number; webSearchCalls: number }, readonly trace: SearchTrace[], readonly rejectedUrls: string[] = []) {
    super(message);
  }
}

export type CollectNewsResult = {
  candidates: NewsCandidate[];
  /** 피드별 결과. 실패한 피드와 이유가 남는다. */
  feeds: FeedResult[];
  /** 고르기에 넘긴 기사 수 */
  pool: number;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

type CollectDependencies = {
  feeds: (date: DateString, signal?: AbortSignal) => Promise<{ items: FeedItem[]; feeds: FeedResult[] }>;
  select: (input: string, signal?: AbortSignal) => Promise<{ picks: unknown; inputTokens: number; outputTokens: number }>;
};

async function selectFromFeeds(input: string, signal?: AbortSignal) {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input,
    reasoning: LIGHT_REASONING,
    text: { format: zodTextFormat(aiNewsSelectionSchema, "news_selection") },
  }, { timeout: NEWS_SELECT_TIMEOUT_MS, maxRetries: 0, signal });
  return { picks: response.output_parsed, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

/**
 * STEP 1 — 주요 이슈 후보 수집. (2026-10-20 웹 검색을 RSS로 바꿨다. 웹 검색이 지면 생성 비용의 대부분이었다)
 *
 * 국내 언론 RSS에서 최근 기사 제목을 모으고(rss.ts), 모델은 그 목록에서 슬롯별 후보를 고르기만 한다. 웹 검색은 하지 않는다.
 * 후보의 출처는 서버가 모은 RSS 기사뿐이다(candidatesFromPicks). 모델이 URL을 만들 수 없다.
 * 이 단계는 후보를 고르기만 한다. 사실 확인은 다음 단계가 기사 본문으로 한다.
 */
export async function collectMarketNews(
  date: DateString,
  signal?: AbortSignal,
  options: { recentNews?: RecentNewsEntry[] } = {},
  dependencies: CollectDependencies = { feeds: collectFeedItems, select: selectFromFeeds },
): Promise<CollectNewsResult> {
  const { items, feeds } = await dependencies.feeds(date, signal);
  if (!items.length) {
    const failed = feeds.filter((feed) => feed.error).map((feed) => `${feed.publisher}: ${feed.error}`);
    throw new NewsCollectionError(
      `RSS에서 기준일 기사를 하나도 모으지 못했습니다.${failed.length ? ` (${failed.join(" / ")})` : ""}`,
      { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 }, [],
    );
  }

  const selected = await dependencies.select(buildNewsSelectionPrompt(date, items, options), signal);
  const usage = { inputTokens: selected.inputTokens, outputTokens: selected.outputTokens, webSearchCalls: 0 };
  const parsed = aiNewsSelectionSchema.safeParse(selected.picks);
  if (!parsed.success) {
    const reason = selected.picks
      ? parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")
      : "구조화된 응답을 받지 못했습니다.";
    throw new NewsCollectionError(`뉴스 후보 고르기 실패: ${reason}`, usage, []);
  }
  const candidates = candidatesFromPicks(parsed.data.candidates, items)
    .flatMap((candidate) => {
      const checked = newsCandidateSchema.safeParse(candidate);
      return checked.success ? [checked.data] : [];
    });
  return { candidates, feeds, pool: items.length, ...usage };
}

/** 그날 검색으로 찾은 테크 상식 후보. candidate는 근거 확인 파이프라인에 그대로 넘길 수 있는 모양이다. */
export type TechTopic = {
  title: string;
  summary: string;
  field: "cs" | "frontend" | "backend" | "ai";
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
