/** 기사 URL 비교. 같은 기사가 여러 피드·후보에 다른 모양의 주소로 실려도 한 기사로 본다. */

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
 * 모바일·www 호스트, 끝 슬래시, 추적용 query 차이로 같은 기사를 다른 기사로 보지 않는다.
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
