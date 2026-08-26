import { GLOSSARY, type GlossaryEntry } from "@/data/glossary";

/** 용어집에 있는 말과 그렇지 않은 말로 쪼갠 조각 */
export type GlossarySegment =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; entry: GlossaryEntry };

const LOOKUP = new Map(GLOSSARY.map((entry) => [entry.term, entry]));

/**
 * 긴 용어를 먼저 찾는다.
 * '물가'가 '소비자물가'를 잘라먹지 않도록 순서가 중요하다.
 */
const PATTERN = new RegExp(
  [...GLOSSARY]
    .sort((a, b) => b.term.length - a.term.length)
    .map((entry) => escapeRegExp(entry.term))
    .join("|"),
  "g",
);

/**
 * 문장에서 용어집에 있는 말을 찾아 조각으로 나눈다.
 *
 * `used`는 한 지면 안에서 이미 설명한 용어를 담는다.
 * 같은 용어가 여러 번 나와도 처음 한 번만 표시해야 지면이 밑줄로 지저분해지지 않는다.
 * (명세 §36 — 색상 tag 남발과 같은 이유다)
 */
export function splitGlossaryTerms(
  text: string,
  used: Set<string>,
): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  let lastIndex = 0;

  // 정규식이 g 플래그를 쓰므로 호출마다 위치를 되돌린다
  PATTERN.lastIndex = 0;

  for (
    let match = PATTERN.exec(text);
    match !== null;
    match = PATTERN.exec(text)
  ) {
    const entry = LOOKUP.get(match[0]);
    if (!entry || used.has(entry.term)) continue;

    used.add(entry.term);

    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }

    segments.push({ kind: "term", text: match[0], entry });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
