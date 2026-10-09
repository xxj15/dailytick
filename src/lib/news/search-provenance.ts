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

  const retrieved = new Set(
    trace.filter((call) => call.status === "completed")
      .flatMap((call) => call.urls.map(sourceUrlKey))
      .filter((url): url is string => url !== null),
  );
  const rejectedUrls: string[] = [];
  const supported = candidates.flatMap((candidate) => {
    const seen = new Set<string>();
    const sources = candidate.sources.filter((source) => {
      const key = sourceUrlKey(source.url);
      if (!key || !retrieved.has(key)) {
        rejectedUrls.push(source.url);
        return false;
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return sources.length ? [{ ...candidate, sources }] : [];
  });
  if (!supported.length) {
    throw new SearchAuditError("뉴스 수집 실패: 검색 기록으로 확인한 출처가 없습니다.", trace, rejectedUrls);
  }
  return { candidates: supported, trace, rejectedUrls };
}
