/**
 * HTML 엔티티를 글자로 바꾼다. RSS 제목에 `&amp;`, `&#039;`, `&quot;`처럼 엔티티가 한 번 더 인코딩된 채 오는 매체가 있다
 * (2026-10-20 점검: 경향신문·머니투데이·ZDNet·아이뉴스24). 두 번 인코딩된 것(`&amp;quot;`)도 풀도록 세 번까지 반복한다.
 * 모르는 이름의 엔티티는 그대로 둔다. 서버 전용 코드를 두지 않는다(지면 컴포넌트에서도 쓴다).
 */
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  middot: "·", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", bull: "•", times: "×", lsaquo: "‹", rsaquo: "›", laquo: "«", raquo: "»",
};

const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

export function decodeHtmlEntities(text: string): string {
  let current = text;
  for (let round = 0; round < 3; round++) {
    const next = current.replace(ENTITY, (match, code: string) => {
      if (code[0] !== "#") return NAMED[code.toLowerCase()] ?? match;
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}
