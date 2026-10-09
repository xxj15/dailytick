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
  const publisher = normalizeEvidenceText(meta("og:site_name") ?? new URL(response.url).hostname);
  const rawDate = meta("article:published_time") ?? meta("datePublished") ?? meta("pubdate") ??
    articles.map((article) => article.datePublished).find((date): date is string => typeof date === "string") ??
    $("time[datetime]").first().attr("datetime") ??
    $(".date, .view_date, .reg_date").first().text().trim();
  const publishedAt = parsePublishedAt(rawDate);
  $("script, style, nav, footer, aside, form, noscript, iframe, [hidden], [aria-hidden='true'], .advertisement, .ad, .related, .copyright").remove();
  $("br").replaceWith(" ");
  $("p, div, li, h1, h2, h3, tr").append(" ");
  const selectors = [
    "[itemprop='articleBody']", "#dic_area", "#newsct_article", "#articletxt", "#article-view-content-div",
    "#articleBody", ".article_body", ".article-body", ".article_view", ".news_cnt_detail_wrap",
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
