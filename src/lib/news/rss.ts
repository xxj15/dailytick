import { load } from "cheerio";
import { NEWS_FEED_ITEMS_PER_FEED, NEWS_FEED_MAX_AGE_HOURS, NEWS_FEEDS } from "@/config/app";
import { isFreshSource, type DateString } from "@/lib/date";
import { normalizeEvidenceText } from "@/lib/news/extract-source";
import { fetchSource, type SourceResponse } from "@/lib/news/fetch-source";
import { sourceMatchKey } from "@/lib/news/url-key";
import type { NewsCandidate, NewsCategory, NewsRegion } from "@/types/briefing";

/**
 * 주요 이슈 후보의 재료. 국내 언론 RSS에서 최근 기사 제목을 모은다. (config/app.ts의 NEWS_FEEDS)
 *
 * 모델은 이 목록에서 고르기만 한다. 후보의 출처 URL은 언제나 여기서 모은 기사다. 모델이 URL을 만들 수 없다.
 * 순수 함수(parseFeed·parseFeedDate·candidatesFromPicks)는 테스트에서 부를 수 있게 서버 전용 코드를 두지 않는다.
 */

export type NewsFeed = (typeof NEWS_FEEDS)[number];

export type FeedItem = {
  /** 고르기 프롬프트에서 기사를 가리키는 짧은 id. n1부터 매긴다. */
  id: string;
  publisher: string;
  section: NewsFeed["section"];
  title: string;
  url: string;
  publishedAt?: string;
};

/** 피드별 결과. 실패한 피드와 이유를 생성 로그에 남긴다. */
export type FeedResult = { publisher: string; url: string; items: number; error?: string };

/** 제목만으로는 사건을 알 수 없거나 뉴스가 아닌 기사. 고르기 전에 뺀다. 사설·칼럼은 핵심 사실의 출처로 쓰지 않는다. */
const NOISE = /^\s*[[【〔(<]\s*(포토|사진|영상|인사|부고|게시판|날씨|운세|오늘의 ?운세|알림|표|그래픽|카드뉴스|만평|광고|AD|사설|칼럼|기고|시론|오피니언)\s*[\]】〕)>]/i;

/**
 * 피드의 게시 시각을 ISO로 바꾼다. 읽을 수 없으면 undefined.
 * RFC 822(Mon, 20 Oct 2026 10:36:44 +0900)와 ISO 8601을 읽는다. 시간대가 없는 시각은 국내 매체이므로 KST로 읽는다.
 * 서버 timezone(UTC)으로 해석하지 않는다.
 */
export function parseFeedDate(value: string | undefined): string | undefined {
  const text = value?.trim();
  // 연도와 시각이 없는 글자는 날짜로 보지 않는다. Date.parse는 "어제" 같은 글자도 엉뚱한 날짜로 읽는다.
  if (!text || !/(19|20)\d{2}/.test(text) || !/\d{1,2}:\d{2}/.test(text)) return undefined;
  const local = /^(\d{4})[-./](\d{2})[-./](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  const zoned = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC|UT)$/i.test(text);
  const timestamp = local
    ? Date.parse(`${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6] ?? "00"}+09:00`)
    : Date.parse(zoned ? text : `${text.replace(/\s*KST$/i, "")} +0900`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

/** 기사 링크. http는 https로 올린다(본문 수집은 https만 한다). 읽을 수 없으면 null. */
function articleUrl(value: string): string | null {
  try {
    const url = new URL(value.trim().replace(/^http:\/\//i, "https://"));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** RSS 2.0(item)과 Atom(entry)을 읽는다. 제목·링크가 없거나 잡음(NOISE)인 기사는 뺀다. */
export function parseFeed(xml: string, feed: Pick<NewsFeed, "publisher" | "section">): Omit<FeedItem, "id">[] {
  const $ = load(xml, { xml: true });
  const nodes = $("item").length ? $("item") : $("entry");
  return nodes.toArray().flatMap((node) => {
    const entry = $(node);
    const title = normalizeEvidenceText(entry.children("title").first().text());
    const link = entry.children("link").first();
    const url = articleUrl(link.attr("href") ?? link.text()) ?? articleUrl(entry.children("guid").first().text());
    if (!title || !url || NOISE.test(title)) return [];
    const publishedAt = parseFeedDate(
      ["pubDate", "dc\\:date", "published", "updated"].map((tag) => entry.children(tag).first().text()).find((text) => text.trim()),
    );
    return [{ publisher: feed.publisher, section: feed.section, title, url, ...(publishedAt ? { publishedAt } : {}) }];
  });
}

export type FetchFeed = (url: string, signal?: AbortSignal) => Promise<SourceResponse>;

/**
 * 모든 피드를 동시에 읽어 고르기에 넘길 기사 목록을 만든다.
 * 피드마다 기준일 범위(NEWS_FEED_MAX_AGE_HOURS) 안의 최신 기사 NEWS_FEED_ITEMS_PER_FEED건을 받고, 같은 기사(URL)는 한 번만 둔다.
 * 피드 하나가 실패해도 나머지로 진행한다. 실패는 feeds에 남는다.
 */
export async function collectFeedItems(
  date: DateString,
  signal?: AbortSignal,
  fetchFeed: FetchFeed = (url, feedSignal) => fetchSource(url, feedSignal, "feed"),
): Promise<{ items: FeedItem[]; feeds: FeedResult[] }> {
  const settled = await Promise.allSettled(NEWS_FEEDS.map(async (feed) => {
    const response = await fetchFeed(feed.url, signal);
    return parseFeed(response.body, feed)
      .filter((item) => isFreshSource(item.publishedAt, date, NEWS_FEED_MAX_AGE_HOURS))
      .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""))
      .slice(0, NEWS_FEED_ITEMS_PER_FEED);
  }));
  signal?.throwIfAborted();

  const seen = new Set<string>();
  const items: FeedItem[] = [];
  const feeds = settled.map((outcome, index): FeedResult => {
    const { publisher, url } = NEWS_FEEDS[index];
    if (outcome.status === "rejected") {
      return { publisher, url, items: 0, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) };
    }
    let added = 0;
    for (const item of outcome.value) {
      const key = sourceMatchKey(item.url) ?? item.url;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...item, id: `n${items.length + 1}` });
      added++;
    }
    return { publisher, url, items: added };
  });
  return { items, feeds };
}

/**
 * 고르기 평가 항목(각 1~10). 2026-10-20 사용자 요청: 최신·화제성이 아니라 읽을 가치로 고른다.
 *   importance      중요도. 파급 범위·새 변화·여러 매체 보도
 *   learningValue   학습 가치. 읽고 나면 경제·산업·기술을 이해하는 틀이 남는가
 *   jobRelevance    직무 관련성. 금융 IT·커머스 IT·DX/AX 실무와 닿는가
 *   explainability  설명 가능성. 원인·배경·영향까지 기사로 설명할 수 있을 것으로 보이는가
 */
export type SelectionScores = { importance: number; learningValue: number; jobRelevance: number; explainability: number };

/** 평가 가중치. 직무 관련성은 가산점 정도로만 둔다. 모든 기사를 직무에 억지로 잇지 않기 위해서다. */
export const SELECTION_WEIGHTS: SelectionScores = { importance: 0.35, learningValue: 0.25, explainability: 0.25, jobRelevance: 0.15 };

/** 후보 점수. 항목마다 1~10으로 자른 뒤 가중합한다. 소수 첫째 자리까지. */
export function selectionScore(scores: SelectionScores): number {
  const clamp = (value: number) => Math.min(10, Math.max(1, Number.isFinite(value) ? value : 1));
  const total = (Object.keys(SELECTION_WEIGHTS) as (keyof SelectionScores)[])
    .reduce((sum, key) => sum + clamp(scores[key]) * SELECTION_WEIGHTS[key], 0);
  return Math.round(total * 10) / 10;
}

/** 모델이 고른 후보 한 건. 같은 사건을 다룬 기사 id를 itemIds로 묶는다. */
export type FeedPick = {
  itemIds: string[];
  title: string;
  summary: string;
  region: NewsRegion;
  category: NewsCategory;
  scores: SelectionScores;
  reason: string;
};

/** 후보 한 건에 붙이는 출처 수 상한. 근거 확인은 그중 앞의 몇 건만 읽는다. */
const SOURCES_PER_CANDIDATE = 4;

/**
 * 고른 결과를 뉴스 후보로 바꾼다. 출처는 목록에 실제로 있는 기사뿐이다.
 * 목록에 없는 id는 버리고, 한 기사는 먼저 고른 후보 하나에만 쓴다. 남은 출처가 없는 후보는 버린다.
 * importance에는 평가 점수의 가중합(selectionScore)을 1~10 정수로 반올림해 넣는다. 근거 확인 순서와 슬롯 채우기가 이 값을 쓴다.
 */
export function candidatesFromPicks(picks: FeedPick[], items: FeedItem[]): NewsCandidate[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  return picks.flatMap((pick) => {
    const sources = [...new Set(pick.itemIds)]
      .flatMap((id) => {
        const item = byId.get(id.trim());
        if (!item || used.has(item.id)) return [];
        used.add(item.id);
        return [{ publisher: item.publisher, title: item.title, url: item.url, ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}) }];
      })
      .slice(0, SOURCES_PER_CANDIDATE);
    if (!sources.length || !pick.title.trim()) return [];
    return [{
      title: pick.title.trim(),
      summary: pick.summary.trim() || pick.title.trim(),
      region: pick.region,
      category: pick.category,
      importance: Math.min(10, Math.max(1, Math.round(selectionScore(pick.scores)))),
      sources,
    }];
  });
}
