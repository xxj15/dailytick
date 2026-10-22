import { load } from "cheerio";
import { NEWS_FEED_ITEMS_PER_FEED, NEWS_FEED_MAX_AGE_HOURS, NEWS_FEEDS, NEWS_SELECTION_FLOOR } from "@/config/app";
import { isFreshSource, type DateString } from "@/lib/date";
import { normalizeEvidenceText } from "@/lib/news/extract-source";
import { decodeHtmlEntities } from "@/lib/news/entities";
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

/**
 * 피드 제목을 지면에 실을 모양으로 다듬는다. 한 번 더 인코딩된 HTML 엔티티(&amp;#039; 등)를 풀고,
 * 앞뒤에 붙은 매체 이름("[연합뉴스]", "… | 연합뉴스", "… - 연합뉴스")을 뗀다.
 */
export function cleanFeedTitle(raw: string, publisher: string): string {
  const name = publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeEvidenceText(decodeHtmlEntities(raw))
    .replace(new RegExp(`^\\s*\\[${name}\\]\\s*`), "")
    .replace(new RegExp(`\\s*[|\\-–—:]\\s*${name}\\s*$`), "")
    .trim();
}

/** RSS 2.0(item)과 Atom(entry)을 읽는다. 제목·링크가 없거나 잡음(NOISE)인 기사는 뺀다. */
export function parseFeed(xml: string, feed: Pick<NewsFeed, "publisher" | "section">): Omit<FeedItem, "id">[] {
  const $ = load(xml, { xml: true });
  const nodes = $("item").length ? $("item") : $("entry");
  return nodes.toArray().flatMap((node) => {
    const entry = $(node);
    const title = cleanFeedTitle(entry.children("title").first().text(), feed.publisher);
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
 * 고르기 평가 항목(각 1~10). 2026-10-22 사용자 결정: 오늘 읽을 가치가 있는 기사를 고른다.
 *   value       정보 가치·관련성. 금융·경제·AI·IT·DX 산업과 사회를 이해하는 데 도움이 되는가. 취업과 닿지 않아도 사회적으로 중요하면 높다
 *   timeliness  시의성. 핵심 사건(새 결정·발표·수치·결과)이 최근에 일어났는가. 기사 게시일이 아니라 사건 발생일로 본다
 *   impact      파급력. 기업·소비자·산업·경제·사회에 실질적인 변화가 있는가
 *   novelty     차별성. 최근 7일 지면과 다른 사건인가, 같은 사건이면 실질적인 새 전개가 있는가
 * 신뢰성은 점수가 아니라 조건이다. 루머·익명 소식통 전언은 고르지 않는다(프롬프트). 사실은 다음 단계가 본문으로 확인한다.
 */
export type SelectionScores = { value: number; timeliness: number; impact: number; novelty: number };

/** 평가 가중치(2026-10-22 사용자 결정). */
export const SELECTION_WEIGHTS: SelectionScores = { value: 0.4, timeliness: 0.25, impact: 0.2, novelty: 0.15 };

const clampScore = (value: number) => Math.min(10, Math.max(1, Number.isFinite(value) ? value : 1));

/** 후보 점수. 항목마다 1~10으로 자른 뒤 가중합한다. 소수 첫째 자리까지. */
export function selectionScore(scores: SelectionScores): number {
  const total = (Object.keys(SELECTION_WEIGHTS) as (keyof SelectionScores)[])
    .reduce((sum, key) => sum + clampScore(scores[key]) * SELECTION_WEIGHTS[key], 0);
  return Math.round(total * 10) / 10;
}

/**
 * 싣지 않을 후보인가. 그렇다면 그 이유, 아니면 null.
 * 총점이 하한보다 낮거나, 시의성·차별성 하나라도 하한보다 낮으면(지난 사건 재보도, 최근에 실은 내용의 반복) 뺀다.
 * 슬롯을 채우려고 약한 기사를 근거 확인·작성에 넘기지 않는다. 그 슬롯은 비는 편이 낫다.
 */
export function belowSelectionFloor(scores: SelectionScores): string | null {
  const score = selectionScore(scores);
  if (score < NEWS_SELECTION_FLOOR.score) return `총점 ${score}이 선정 하한 ${NEWS_SELECTION_FLOOR.score}보다 낮다`;
  if (clampScore(scores.timeliness) < NEWS_SELECTION_FLOOR.timeliness) return `시의성 ${scores.timeliness}점: 지난 사건의 재보도·정리이거나 일정 예고다`;
  if (clampScore(scores.novelty) < NEWS_SELECTION_FLOOR.novelty) return `차별성 ${scores.novelty}점: 최근에 실은 사건과 새 전개 없이 겹친다`;
  return null;
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
 * 모델이 적은 기사 id를 목록 id(n12)로 맞춘다. "n12", " N12 ", "12", "n12 | 연합뉴스…"를 모두 n12로 읽는다.
 * 형식이 조금 달라 고른 후보가 통째로 버려지지 않게 한다. 목록에 없는 번호는 여전히 버린다.
 */
export function normalizeItemId(id: string): string {
  const match = /^\s*n?\s*(\d+)/i.exec(id);
  return match ? `n${Number(match[1])}` : id.trim();
}

/**
 * 고른 결과를 뉴스 후보로 바꾼다. 출처는 목록에 실제로 있는 기사뿐이다.
 * 목록에 없는 id는 버리고, 한 기사는 먼저 고른 후보 하나에만 쓴다. 남은 출처가 없는 후보는 버린다.
 * importance에는 평가 점수의 가중합(selectionScore, 소수 첫째 자리)을 넣는다. 근거 확인 순서와 슬롯 채우기가 이 값을 쓴다.
 * 정수로 반올림하면 7.6과 8.4가 같은 8이 돼 순서가 모델이 적은 순서로 정해졌다(2026-10-22 생성 로그).
 */
export function candidatesFromPicks(picks: FeedPick[], items: FeedItem[]): NewsCandidate[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  return picks.flatMap((pick) => {
    const sources = [...new Set(pick.itemIds)]
      .flatMap((id) => {
        const item = byId.get(normalizeItemId(id));
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
      importance: selectionScore(pick.scores),
      sources,
    }];
  });
}
