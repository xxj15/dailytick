import { CURRICULUM, CURRICULUM_BY_SLUG, type CurriculumConcept } from "@/data/curriculum";
import type { ConceptHistoryEntry } from "@/types/briefing";

export type ConceptSelection = {
  concepts: CurriculumConcept[];
  /** new = 아직 다루지 않은 개념 / review = 커리큘럼을 한 바퀴 돈 뒤의 복습 */
  mode: "new" | "review";
};

/**
 * 오늘 학습할 금융 개념 선정.
 *
 *   curriculum 전체 목록
 *     → 이미 다룬 slug 제외
 *     → 가장 앞 순서의 미학습 concept 선택
 *     → 밀접한 개념이면 최대 2개까지 함께
 *
 * 커리큘럼을 모두 돌았으면 가장 오래전에 다룬 개념부터 다시 꺼낸다.
 * 늘 첫 개념으로 돌아가면 같은 개념만 매일 반복된다.
 *
 * AI가 순서를 임의로 바꾸지 않도록, 선정은 코드에서만 수행한다.
 */
export function selectTodayConcepts(
  history: ConceptHistoryEntry[],
): ConceptSelection {
  // history는 최신순이다. 먼저 만난 index가 곧 마지막으로 다룬 시점.
  const lastSeen = new Map<string, number>();

  history.forEach((entry, index) => {
    for (const item of entry.items) {
      if (!lastSeen.has(item.slug)) lastSeen.set(item.slug, index);
    }
  });

  const next = CURRICULUM.find((concept) => !lastSeen.has(concept.slug));

  if (next) {
    const concepts = [next];

    if (next.pairWith) {
      const pair = CURRICULUM_BY_SLUG.get(next.pairWith);
      if (pair && !lastSeen.has(pair.slug)) concepts.push(pair);
    }

    return { concepts, mode: "new" };
  }

  // index가 클수록 오래된 브리핑이다. 같은 값이면 커리큘럼 순서를 따른다.
  const oldest = [...CURRICULUM].sort(
    (a, b) => (lastSeen.get(b.slug) ?? 0) - (lastSeen.get(a.slug) ?? 0),
  )[0];

  return { concepts: [oldest], mode: "review" };
}

/** 프롬프트에 넘길 '이미 다룬 개념' 제목. 최근 것부터. */
export function collectLearnedTitles(
  history: ConceptHistoryEntry[],
  limit = 40,
): string[] {
  const titles: string[] = [];

  for (const entry of history) {
    for (const item of entry.items) {
      if (!titles.includes(item.title)) titles.push(item.title);
      if (titles.length >= limit) return titles;
    }
  }

  return titles;
}
