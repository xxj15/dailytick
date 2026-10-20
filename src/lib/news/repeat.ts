import { sourceMatchKey } from "@/lib/news/url-key";
import type { NewsCategory, NewsSource, RecentNewsEntry } from "@/types/briefing";

/**
 * 최근에 실은 사건을 다시 고르지 않게 하는 코드 쪽 안전망. 순수 함수만 둔다.
 * 같은 사건인지에 대한 판단은 고르기·작성·검토 단계의 모델이 먼저 한다. 여기서는 확실한 경우만 거른다.
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
 * 최근에 실은 사건과 같은 후보인가. 같으면 그 사건 제목, 아니면 null.
 * 같은 기사 URL을 출처로 쓰거나(새 변화가 있을 수 없다), 지표 기사가 아닌데 제목이 거의 같으면 같은 사건이다.
 */
export function repeatOfRecent(
  candidate: { title: string; category: NewsCategory; sources: Pick<NewsSource, "url" | "title">[] },
  recentNews: RecentNewsEntry[],
): string | null {
  const keys = new Set(candidate.sources.map((source) => sourceMatchKey(source.url)).filter(Boolean));
  for (const entry of recentNews) {
    if (entry.urls.some((url) => keys.has(sourceMatchKey(url)))) return entry.title;
  }
  if (INDICATOR_CATEGORIES.has(candidate.category)) return null;
  const titles = [candidate.title, ...candidate.sources.map((source) => source.title)];
  for (const entry of recentNews) {
    if (titles.some((title) => titleSimilarity(title, entry.title) >= SAME_TITLE_THRESHOLD)) return entry.title;
  }
  return null;
}
