import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { SourceDocument } from "@/lib/news/evidence-types";
import type { SourceResponse } from "@/lib/news/fetch-source";

export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** timezone 없는 날짜는 서버 timezone으로 해석하지 않는다. 날짜만 있으면 보수적으로 KST 자정. */
export function parsePublishedAt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  value = value.trim().replace(/^(등록일|작성일|입력|게시일)\s*[:：]?\s*/, "");
  const englishDate = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/.exec(value);
  if (englishDate) {
    const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(englishDate[1]) + 1;
    value = `${englishDate[3]}-${String(month).padStart(2, "0")}-${englishDate[2].padStart(2, "0")}`;
  }
  const dateOnly = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/.exec(value.trim());
  const normalized = dateOnly
    ? `${dateOnly[1]}-${dateOnly[2].padStart(2, "0")}-${dateOnly[3].padStart(2, "0")}T00:00:00+09:00`
    : value.trim();
  if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) return undefined;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return undefined;
  // Date.parse가 2월 30일 등을 다음 달로 보정하는 것도 거절한다.
  const [year, month, day] = normalized.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return undefined;
  return new Date(timestamp).toISOString();
}

function articleObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(articleObjects);
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
  return [
    ...(types.some((type) => typeof type === "string" && /^(NewsArticle|Article|Report|PressRelease)$/.test(type)) ? [obj] : []),
    ...articleObjects(obj["@graph"]),
  ];
}

/** 기사/보도자료 영역만 읽는다. 전체 body·검색 description으로 대체하지 않는다. */
export function extractSource(response: SourceResponse, requestedUrl: string, fetchedAt = new Date().toISOString()): SourceDocument {
  if (!/html/i.test(response.contentType)) throw new Error("게시 정보를 확인할 수 있는 HTML 자료가 필요합니다.");
  const $ = load(response.body);
  const articles: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, node) => {
    try { articles.push(...articleObjects(JSON.parse($(node).text()))); } catch { /* 잘못된 JSON-LD는 사용하지 않는다. */ }
  });
  if (articles.some((article) => article.isAccessibleForFree === false || article.isAccessibleForFree === "False")) {
    throw new Error("무료 공개 본문이 아닌 자료입니다.");
  }
  const meta = (key: string) => $(`meta[property='${key}'], meta[name='${key}'], meta[itemprop='${key}']`).first().attr("content");
  const title = normalizeEvidenceText(meta("og:title") ?? $("h1").first().text() ?? "") || normalizeEvidenceText($("title").text());
  const publisher = normalizeEvidenceText(meta("og:site_name") ?? meta("publisher") ?? new URL(response.url).hostname);
  // 메뉴·관련 기사에 표시된 오늘 날짜를 원문의 게시일로 쓰지 않는다.
  const dateScope = $("article, #article, .bd-view, .article-view").first();
  const rawDate = meta("article:published_time") ?? meta("datePublished") ?? meta("pubdate") ??
    articles.map((article) => article.datePublished).find((date): date is string => typeof date === "string") ??
    dateScope.find("time[itemprop='datePublished'], time[pubdate]").first().attr("datetime") ??
    dateScope.find(".article__time, .date, .view_date, .reg_date").first().text().trim();
  let publishedAt = parsePublishedAt(rawDate);
  const hostname = new URL(response.url).hostname;
  // Fed는 본문 날짜와 공개 시각·timezone을 서로 다른 요소에 표시한다.
  if (hostname === "www.federalreserve.gov" || hostname === "federalreserve.gov") {
    const clock = /For release at (\d{1,2}):(\d{2})\s*([ap])\.m\.\s*(EDT|EST)/i.exec($(".releaseTime").text());
    if (clock && publishedAt && /^[A-Za-z]+ \d{1,2}, \d{4}$/.test(rawDate.trim())) {
      const day = new Date(Date.parse(publishedAt) + 9 * 3_600_000).toISOString().slice(0, 10);
      const hour = (Number(clock[1]) % 12) + (clock[3].toLowerCase() === "p" ? 12 : 0);
      publishedAt = parsePublishedAt(`${day}T${String(hour).padStart(2, "0")}:${clock[2]}:00${clock[4].toUpperCase() === "EDT" ? "-04:00" : "-05:00"}`);
    }
  }
  // 기관 게시판은 본문 전체를 form 안에 넣기도 하므로 form 자체를 지우지 않는다.
  $("script, style, nav, footer, aside, input, button, select, textarea, noscript, iframe, [hidden], [aria-hidden='true'], .advertisement, .ad, .related, .copyright").remove();
  $("br").replaceWith(" ");
  $("p, div, li, h1, h2, h3, tr").append(" ");
  const selectors = [
    "[itemprop='articleBody']", "#dic_area", "#newsct_article", "#articletxt", "#article-view-content-div",
    "#articleBody", "#article", ".article_body", ".article-body", ".article_view", ".news_cnt_detail_wrap",
    ".dbdata", ".bd_view_detail", ".view_cont", "article",
  ];
  let text = "";
  for (const selector of selectors) {
    const candidates = $(selector).toArray().map((node) => normalizeEvidenceText($(node).text()));
    text = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
    if (text.length >= 200) break;
  }
  if (!title || text.length < 200) throw new Error("충분한 기사·발표 본문을 확보하지 못했습니다.");
  text = text.slice(0, 24_000);
  return {
    id: `s-${createHash("sha256").update(response.url).digest("hex").slice(0, 16)}`,
    requestedUrl,
    source: { title: title.slice(0, 300), publisher: publisher.slice(0, 100), url: response.url, ...(publishedAt ? { publishedAt } : {}) },
    fetchedAt,
    contentHash: createHash("sha256").update(text).digest("hex"),
    text,
  };
}
