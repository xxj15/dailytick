import { strict as assert } from "node:assert";
import test from "node:test";
import type { ResponseFunctionWebSearch } from "openai/resources/responses/responses";
import { auditSearchResults, sourceUrlKey } from "@/lib/news/search-provenance";
import type { NewsCandidate } from "@/types/briefing";

const candidate: NewsCandidate = {
  title: "금리 결정", summary: "검색 요약", region: "KR", category: "rates", importance: 9,
  sources: [{ publisher: "기관", title: "발표", url: "https://example.com/a" }],
};
const call: ResponseFunctionWebSearch = {
  id: "search-1", type: "web_search_call", status: "completed",
  action: { type: "search", queries: ["금리 발표"], sources: [{ type: "url", url: "https://example.com/a" }] },
};

test("실제 검색으로 반환된 URL만 남기고 모델이 추가한 출처는 제거한다", () => {
  const result = auditSearchResults([{ ...candidate, sources: [
    ...candidate.sources, { ...candidate.sources[0], url: "https://example.com/invented" },
  ] }], [call]);
  assert.equal(result.candidates[0].sources.length, 1);
  assert.deepEqual(result.rejectedUrls, ["https://example.com/invented"]);
  assert.deepEqual(result.trace[0].queries, ["금리 발표"]);
});

test("검색이 없거나 실패했거나 출처 목록이 없으면 발행 후보를 만들지 않는다", () => {
  assert.throws(() => auditSearchResults([candidate], []), /완료된 웹 검색/);
  assert.throws(() => auditSearchResults([candidate], [{ ...call, status: "failed" }]), /완료된 웹 검색/);
  assert.throws(() => auditSearchResults([candidate], [{ ...call, action: { type: "search" } }]), /확인한 출처/);
});

test("완료된 페이지 열기 기록도 근거 URL로 사용하지만 검색은 반드시 있어야 한다", () => {
  const opened: ResponseFunctionWebSearch = { ...call, id: "open-1", action: { type: "open_page", url: "https://example.com/b" } };
  const result = auditSearchResults([{ ...candidate, sources: [{ ...candidate.sources[0], url: "https://example.com/b#body" }] }], [call, opened]);
  assert.equal(result.candidates.length, 1);
  assert.throws(() => auditSearchResults([candidate], [opened]), /완료된 웹 검색/);
});

test("query를 유지하고 안전하지 않은 URL을 거른다", () => {
  assert.notEqual(sourceUrlKey("https://example.com/a?id=1"), sourceUrlKey("https://example.com/a?id=2"));
  assert.equal(sourceUrlKey("http://example.com/a"), null);
  assert.equal(sourceUrlKey("https://user:pass@example.com/a"), null);
});
