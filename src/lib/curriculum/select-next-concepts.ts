import { CURRICULUM, CURRICULUM_BY_SLUG, type CurriculumConcept } from "@/data/curriculum";

/**
 * 오늘 학습할 금융 개념 선정.
 *
 * curriculum 전체 목록
 *   → 이미 학습한 slug 제외
 *   → 가장 앞 순서의 미학습 concept 선택
 *   → 밀접한 개념이면 최대 2개까지 함께
 *
 * AI가 순서를 임의로 바꾸지 않도록, 선정은 코드에서만 수행한다.
 */
export function selectNextConcepts(
  learnedSlugs: Iterable<string>,
): CurriculumConcept[] {
  const learned = new Set(learnedSlugs);
  const next = CURRICULUM.find((concept) => !learned.has(concept.slug));

  // 커리큘럼을 모두 학습한 경우: 개념 없이 뉴스만 발행한다.
  if (!next) return [];

  const selected = [next];

  if (next.pairWith) {
    const pair = CURRICULUM_BY_SLUG.get(next.pairWith);
    if (pair && !learned.has(pair.slug)) {
      selected.push(pair);
    }
  }

  return selected;
}

/** 과거 브리핑들에서 이미 다룬 concept slug를 모은다. */
export function collectLearnedSlugs(
  briefings: { knowledgeItems: { slug: string }[] }[],
): Set<string> {
  const slugs = new Set<string>();
  for (const briefing of briefings) {
    for (const item of briefing.knowledgeItems) {
      slugs.add(item.slug);
    }
  }
  return slugs;
}
