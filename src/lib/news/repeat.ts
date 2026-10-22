import { sourceMatchKey } from "@/lib/news/url-key";
import type { NewsCategory, NewsSource, RecentNewsEntry } from "@/types/briefing";

/**
 * 최근에 실은 사건을 다시 고르지 않게 하는 코드 쪽 안전망. 순수 함수만 둔다.
 * 같은 사건인지에 대한 판단은 고르기·작성·검토 단계의 모델이 먼저 한다. 여기서는 확실한 경우만 거른다.
 * 새 전개가 보이는 후보(후속일 수 있다)는 거르지 않고 모델 판단(followUp·검토)에 맡긴다. 중요한 후속을 반복으로 잘못 빼지 않기 위해서다.
 */

/** 제목 비교용 글자 묶음. [속보]·[단독] 같은 머리말과 기호를 지우고 한글·영문·숫자만 남긴 뒤 두 글자씩 묶는다. */
function bigrams(title: string): Set<string> {
  const text = title.replace(/\[[^\]]*\]/g, "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const pairs = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) pairs.add(text.slice(i, i + 2));
  return pairs;
}

/** 두 제목이 얼마나 같은가(Dice 계수, 0~1). */
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const pair of x) if (y.has(pair)) common++;
  return (2 * common) / (x.size + y.size);
}

/** 이 정도로 제목이 같으면 같은 사건으로 본다. "정부, 우크라 공관원 일부 철수 결정"과 "한국, 우크라이나 주재 공관원 일부 철수 결정"이 0.73이다. */
export const SAME_TITLE_THRESHOLD = 0.6;

/** 매일 움직이는 지표 기사. 제목이 비슷해도 다른 날이면 다른 사건일 수 있어 제목으로는 거르지 않는다(같은 기사 URL만 거른다). */
const INDICATOR_CATEGORIES = new Set<NewsCategory>(["stocks", "fx", "rates"]);

/**
 * 같은 사건이 한 단계 나아갔다는 말. 추진하던 정책의 확정·시행, 협상의 타결·결렬, 재판의 선고 같은 것이다.
 * 최근에 실은 기사에 없던 이 말이 후보 제목에 새로 나오면 후속일 수 있다. '발표'처럼 어느 기사에나 붙는 말은 넣지 않는다.
 */
const DEVELOPMENT_WORDS = [
  "확정", "통과", "의결", "가결", "부결", "시행", "발효", "승인", "허가", "합의", "타결", "결렬", "체결", "서명",
  "착수", "개시", "완료", "철회", "취소", "연기", "중단", "재개", "인상", "인하", "동결", "선고", "판결", "기소",
  "구속", "체포", "사임", "해임", "경질", "임명", "출범", "공식화", "출시", "상장", "폐지", "파산", "제재", "해제",
];

/** 글에 나오는 수치. 날짜·시각(2026년·10월·21일·9시)과 기사 판 번호(2보)는 사건의 새 수치가 아니라서 뺀다. */
function numbersIn(text: string): Set<string> {
  return new Set(text.match(/(?<![\d.,])\d+(?:[.,]\d+)*(?![\d.,]|\s*(?:년|월|일|시|보))/g) ?? []);
}

/**
 * 후보 제목에 최근 기사에 없던 새 전개가 보이는가. 보이면 그 말(또는 새 수치), 아니면 null.
 * recent에는 최근 기사의 지면 제목·원 기사 제목·핵심 요약을 함께 넣는다. 요약에 이미 있던 수치는 새 수치가 아니다.
 */
export function newDevelopment(candidate: string[], recent: string[]): string | null {
  const before = recent.join(" ");
  const after = candidate.join(" ");
  const word = DEVELOPMENT_WORDS.find((entry) => after.includes(entry) && !before.includes(entry));
  if (word) return word;
  const known = numbersIn(before);
  return [...numbersIn(after)].find((number) => !known.has(number)) ?? null;
}

/**
 * 최근에 실은 사건과 같은 후보인가. 같으면 그 사건 제목, 아니면 null.
 * 같은 기사 URL을 출처로 쓰면(새 변화가 있을 수 없다) 반복이다.
 * 지표 기사가 아닌데 제목(지면 제목·원 기사 제목)이 거의 같으면 같은 사건이다. 이때 후보 제목에 새 전개가 보이면 followUp에 그 말을 담는다.
 * followUp이 있는 후보는 거르지 않는다. 작성 단계가 followUp을 적고, 검토가 새 변화가 근거에 있는지 본다.
 */
export function repeatOfRecent(
  candidate: { title: string; category: NewsCategory; sources: Pick<NewsSource, "url" | "title">[] },
  recentNews: RecentNewsEntry[],
): { title: string; followUp?: string } | null {
  const keys = new Set(candidate.sources.map((source) => sourceMatchKey(source.url)).filter(Boolean));
  for (const entry of recentNews) {
    if (entry.urls.some((url) => keys.has(sourceMatchKey(url)))) return { title: entry.title };
  }
  if (INDICATOR_CATEGORIES.has(candidate.category)) return null;
  const titles = [candidate.title, ...candidate.sources.map((source) => source.title)];
  for (const entry of recentNews) {
    const recentTitles = [entry.title, ...(entry.sourceTitles ?? [])];
    if (!titles.some((title) => recentTitles.some((recent) => titleSimilarity(title, recent) >= SAME_TITLE_THRESHOLD))) continue;
    const development = newDevelopment(titles, [...recentTitles, entry.whatHappened]);
    return development ? { title: entry.title, followUp: development } : { title: entry.title };
  }
  return null;
}

/**
 * 같은 날 후보끼리 같은 사건이면 점수(importance)가 높은 후보 하나만 남긴다.
 * 고르기 모델이 한 사건을 분류만 바꿔 두 슬롯 후보로 낸 경우를 거른다. 같은 사건이 두 슬롯에 실리지 않게 한다.
 * 제목(후보 제목·원 기사 제목)이 거의 같을 때만 같은 사건으로 본다. 같은 날이므로 지표 기사도 똑같이 본다.
 * 남긴 후보는 원래 순서를 지킨다.
 */
export function mergeSameEvent<T extends { title: string; importance: number; sources: Pick<NewsSource, "title">[] }>(
  candidates: T[],
): { kept: T[]; merged: { title: string; kept: string }[] } {
  const titlesOf = (candidate: T) => [candidate.title, ...candidate.sources.map((source) => source.title)];
  const kept: T[] = [];
  const merged: { title: string; kept: string }[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.importance - a.importance)) {
    const same = kept.find((entry) =>
      titlesOf(entry).some((a) => titlesOf(candidate).some((b) => titleSimilarity(a, b) >= SAME_TITLE_THRESHOLD)));
    if (same) merged.push({ title: candidate.title, kept: same.title });
    else kept.push(candidate);
  }
  return { kept: candidates.filter((candidate) => kept.includes(candidate)), merged };
}
