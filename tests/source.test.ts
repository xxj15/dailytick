import { strict as assert } from "node:assert";
import test from "node:test";
import { extractSource, parsePublishedAt } from "@/lib/news/extract-source";
import { isPublicIPv4, validateSourceUrl } from "@/lib/news/fetch-source";

const text = "위원회는 이번 회의에서 기준금리 동결을 결정했다. 물가와 경기 상황을 점검하며 향후 정책 방향을 논의했다. ".repeat(5);
function html(body: string) { return { url: "https://example.com/release", contentType: "text/html", body }; }

test("실제 본문과 게시 metadata를 추출하고 광고·스크립트를 제거한다", () => {
  const doc = extractSource(html(`<meta property="og:title" content="금리 결정"><meta property="article:published_time" content="2026-10-09T07:00:00+09:00"><article><p>${text}</p><script>가짜 숫자 999</script><aside>관련 기사</aside></article>`), "https://example.com/release");
  assert.equal(doc.source.title, "금리 결정");
  assert.equal(doc.source.publishedAt, "2026-10-08T22:00:00.000Z");
  assert.ok(!doc.text.includes("999") && !doc.text.includes("관련 기사"));
  assert.equal(doc.contentHash.length, 64);
});

test("검색 요약·로그인 안내·본문 없는 페이지·유료 기사를 근거로 쓰지 않는다", () => {
  assert.throws(() => extractSource(html(`<title>뉴스</title><meta name="description" content="${text}"><main>로그인하세요</main>`), "https://example.com/release"), /본문/);
  assert.throws(() => extractSource(html(`<title>뉴스</title><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script><article>${text}</article>`), "https://example.com/release"), /무료 공개/);
});

test("JSON-LD 게시일을 읽되 수정일이나 AI가 제시한 시각으로 대체하지 않는다", () => {
  const doc = extractSource(html(`<title>공식 발표</title><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-10-08","dateModified":"2026-10-09"}]}</script><article>${text}</article>`), "https://example.com/release");
  assert.equal(doc.source.publishedAt, "2026-10-07T15:00:00.000Z");
  const undated = extractSource(html(`<title>공식 발표</title><article>${text}</article>`), "https://example.com/release");
  assert.equal(undated.source.publishedAt, undefined);
  assert.equal(parsePublishedAt("2026-10-09 07:00:00"), undefined);
  assert.equal(parsePublishedAt("2026-02-30"), undefined);
});

test("내부 주소와 비공개 대역을 거부하고 공개 DNS 결과만 허용한다", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.19.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicIPv4(address), false, address);
  }
  assert.equal(isPublicIPv4("8.8.8.8"), true);
  for (const url of ["http://example.com", "https://127.0.0.1", "https://[::1]", "https://example.com:8080", "https://user:pass@example.com", "https://host.internal"]) {
    assert.throws(() => validateSourceUrl(url), Error, url);
  }
  assert.equal(validateSourceUrl("https://example.com/article").hostname, "example.com");
});

test("한국은행 형태의 form 안 본문과 실제 게시일을 읽고 입력 위젯만 제거한다", () => {
  const doc = extractSource(html(`<meta property="og:title" content="공식 정책 발표"><meta property="publisher" content="한국은행"><form><div class="bd-view"><span class="date">2026.10.09</span><div class="dbdata">${text}<button>검색</button></div></div></form>`), "https://example.com/release");
  assert.equal(doc.source.publisher, "한국은행");
  assert.equal(doc.source.publishedAt, "2026-10-08T15:00:00.000Z");
  assert.ok(!doc.text.includes("검색"));
});

test("메뉴와 관련 기사에 표시된 오늘 날짜를 원문의 게시일로 사용하지 않는다", () => {
  const doc = extractSource(html(`<title>과거 발표</title><header><span class="date">2026.10.09</span></header><article>${text}</article><aside><time datetime="2026-10-09T08:00:00+09:00">관련 기사</time></aside>`), "https://example.com/release");
  assert.equal(doc.source.publishedAt, undefined);
});

test("Fed 발표 날짜와 EDT 공개 시각을 조합하고 수정일과 구분한다", () => {
  const url = "https://www.federalreserve.gov/newsevents/pressreleases/release.htm";
  const doc = extractSource({ url, contentType: "text/html", body: `<title>Policy release</title><div id="article"><p class="article__time">March 19, 2025</p><p class="releaseTime">For release at 2:00 p.m. EDT</p><div>${text}</div></div><div id="lastUpdate">October 9, 2026</div>` }, url);
  assert.equal(doc.source.publishedAt, "2025-03-19T18:00:00.000Z");
});
