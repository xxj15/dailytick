import type { ResponseFunctionWebSearch } from "openai/resources/responses/responses";
import type { NewsCandidate } from "@/types/briefing";

export type SearchTrace = {
  id: string;
  action: "search" | "open_page" | "find_in_page";
  status: string;
  urls: string[];
  queries: string[];
};

export class SearchAuditError extends Error {
  constructor(message: string, readonly trace: SearchTrace[], readonly rejectedUrls: string[] = []) {
    super(message);
  }
}

/** Fragment만 제거한다. 경로와 query가 다른 URL을 같은 기사로 취급하지 않는다. */
export function sourceUrlKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * 같은 기사인지 비교할 때만 쓰는 열쇠. 수집(fetch)에는 쓰지 않는다.
 * 모바일·www 호스트, 끝 슬래시, 추적용 query 차이로 같은 기사를 '검색에 없던 URL'로 버리지 않는다.
 * 기사 번호처럼 기사를 가리키는 query(idxno, no 등)는 그대로 둔다.
 */
export function sourceMatchKey(value: string): string | null {
  const key = sourceUrlKey(value);
  if (!key) return null;
  const url = new URL(key);
  url.hostname = url.hostname.replace(/^(www|m|mobile)\./, "");
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid|ref|ref_src|from|source)$/i.test(name)) url.searchParams.delete(name);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

/** 모델이 JSON에 적은 URL 대신 실제 완료된 도구 호출의 URL을 기준으로 삼는다. */
export function searchTraceFromCalls(calls: ResponseFunctionWebSearch[]): SearchTrace[] {
  return calls.map((call) => ({
    id: call.id,
    action: call.action.type,
    status: call.status,
    urls:
      call.action.type === "search"
        ? (call.action.sources ?? []).map((source) => source.url)
        : call.action.url
          ? [call.action.url]
          : [],
    queries:
      call.action.type === "search"
        ? (call.action.queries ?? (call.action.query ? [call.action.query] : []))
        : [],
  }));
}

export function auditSearchResults(candidates: NewsCandidate[], calls: ResponseFunctionWebSearch[]) {
  const trace = searchTraceFromCalls(calls);
  if (!trace.some((call) => call.action === "search" && call.status === "completed")) {
    throw new SearchAuditError("뉴스 수집 실패: 완료된 웹 검색이 없습니다.", trace);
  }

  // 비교는 느슨한 열쇠로 하되, 남기는 URL은 검색이 실제로 돌려준 원래 주소다.
  const retrieved = new Map<string, string>();
  for (const url of trace.filter((call) => call.status === "completed").flatMap((call) => call.urls)) {
    const match = sourceMatchKey(url);
    const original = sourceUrlKey(url);
    if (match && original && !retrieved.has(match)) retrieved.set(match, original);
  }
  const rejectedUrls: string[] = [];
  const supported = candidates.flatMap((candidate) => {
    const seen = new Set<string>();
    const sources = candidate.sources.flatMap((source) => {
      const match = sourceMatchKey(source.url);
      const original = match ? retrieved.get(match) : undefined;
      if (!match || !original) {
        rejectedUrls.push(source.url);
        return [];
      }
      if (seen.has(match)) return [];
      seen.add(match);
      return [{ ...source, url: original }];
    });
    return sources.length ? [{ ...candidate, sources }] : [];
  });
  if (!supported.length) {
    throw new SearchAuditError("뉴스 수집 실패: 검색 기록으로 확인한 출처가 없습니다.", trace, rejectedUrls);
  }
  return { candidates: supported, trace, rejectedUrls };
}
