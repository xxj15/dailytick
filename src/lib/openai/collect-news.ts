import "server-only";
import { NEWS_SELECT_TIMEOUT_MS } from "@/config/app";
import { getModel, getOpenAI, LIGHT_REASONING } from "@/lib/openai/client";
import { buildNewsSelectionPrompt } from "@/lib/openai/prompts";
import { aiNewsSelectionSchema, newsCandidateSchema } from "@/lib/openai/schemas";
import type { DateString } from "@/lib/date";
import { candidatesFromPicks, collectFeedItems, normalizeItemId, selectionScore, type FeedItem, type FeedResult, type SelectionScores } from "@/lib/news/rss";
import { repeatOfRecent } from "@/lib/news/repeat";
import type { NewsCandidate, RecentNewsEntry } from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";

/** 수집 실패. 그때까지 쓴 사용량을 들고 나가 생성 로그에 남긴다. */
export class NewsCollectionError extends Error {
  constructor(message: string, readonly usage: { inputTokens: number; outputTokens: number; webSearchCalls: number }) {
    super(message);
  }
}

export type CollectNewsResult = {
  candidates: NewsCandidate[];
  /** 피드별 결과. 실패한 피드와 이유가 남는다. */
  feeds: FeedResult[];
  /** 고르기에 넘긴 기사 수 */
  pool: number;
  /** 고르기 결과. 후보마다 평가 점수·선정 이유, 그리고 고르지 않은 주요 기사와 그 이유. 생성 로그에 남긴다. */
  selection: NewsSelectionAudit;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

type CollectDependencies = {
  feeds: (date: DateString, signal?: AbortSignal) => Promise<{ items: FeedItem[]; feeds: FeedResult[] }>;
  select: (input: string, signal?: AbortSignal) => Promise<{ picks: unknown; inputTokens: number; outputTokens: number }>;
};

export type NewsSelectionAudit = {
  /** unmatchedIds는 목록에 없어 버린 기사 id다. 후보가 적을 때 원인을 가른다. */
  picked: { title: string; category: string; score: number; scores: SelectionScores; reason: string; itemIds: string[]; unmatchedIds?: string[] }[];
  rejected: { title: string; reason: string }[];
  /** 후보 모양 검사(newsCandidateSchema)에서 떨어진 후보와 첫 이유 */
  invalid?: string[];
  /** 최근에 실은 사건과 같아 뺀 후보(같은 기사 URL이거나 제목이 거의 같다) */
  repeats?: { title: string; recent: string }[];
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
      { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 },
    );
  }

  const selected = await dependencies.select(buildNewsSelectionPrompt(date, items, options), signal);
  const usage = { inputTokens: selected.inputTokens, outputTokens: selected.outputTokens, webSearchCalls: 0 };
  const parsed = aiNewsSelectionSchema.safeParse(selected.picks);
  if (!parsed.success) {
    const reason = selected.picks
      ? parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")
      : "구조화된 응답을 받지 못했습니다.";
    throw new NewsCollectionError(`뉴스 후보 고르기 실패: ${reason}`, usage);
  }
  const invalid: string[] = [];
  const repeats: { title: string; recent: string }[] = [];
  const candidates = candidatesFromPicks(parsed.data.candidates, items)
    .flatMap((candidate) => {
      const checked = newsCandidateSchema.safeParse(candidate);
      if (!checked.success) invalid.push(`${candidate.title}: ${checked.error.issues[0]?.path.join(".")} ${checked.error.issues[0]?.message}`);
      return checked.success ? [checked.data] : [];
    })
    // 모델이 놓친 반복을 코드가 한 번 더 거른다. 같은 기사 URL이거나 제목이 거의 같은 후보다(지표 기사는 URL만 본다)
    .filter((candidate) => {
      const recent = repeatOfRecent(candidate, options.recentNews ?? []);
      if (recent) repeats.push({ title: candidate.title, recent });
      return !recent;
    });
  const known = new Set(items.map((item) => item.id));
  const selection: NewsSelectionAudit = {
    picked: parsed.data.candidates.map((pick) => {
      const unmatchedIds = pick.itemIds.filter((id) => !known.has(normalizeItemId(id)));
      return {
        title: pick.title, category: pick.category, score: selectionScore(pick.scores), scores: pick.scores, reason: pick.reason,
        itemIds: pick.itemIds, ...(unmatchedIds.length ? { unmatchedIds } : {}),
      };
    }),
    rejected: parsed.data.rejected,
    ...(invalid.length ? { invalid } : {}),
    ...(repeats.length ? { repeats } : {}),
  };
  return { candidates, feeds, pool: items.length, selection, ...usage };
}
