import { strict as assert } from "node:assert";
import test from "node:test";
import { sourceMatchKey, sourceUrlKey } from "@/lib/news/url-key";

test("query를 유지하고 안전하지 않은 URL을 거른다", () => {
  assert.notEqual(sourceUrlKey("https://example.com/a?id=1"), sourceUrlKey("https://example.com/a?id=2"));
  assert.equal(sourceUrlKey("http://example.com/a"), null);
  assert.equal(sourceUrlKey("https://user:pass@example.com/a"), null);
  assert.equal(sourceUrlKey("https://example.com/a#body"), "https://example.com/a");
});

test("모바일 주소·끝 슬래시·추적 query 차이는 같은 기사로 보고, 기사를 가리키는 query가 다르면 다른 기사로 본다", () => {
  assert.equal(
    sourceMatchKey("https://m.news.example.com/article/123/"),
    sourceMatchKey("https://www.news.example.com/article/123?utm_source=rss"),
  );
  assert.notEqual(sourceMatchKey("https://news.example.com/view?idxno=1"), sourceMatchKey("https://news.example.com/view?idxno=2"));
});
