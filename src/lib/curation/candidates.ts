import { CURRICULUM, type Concept, type KnowledgeFormat } from "@/data/curriculum";
import { TECH_ARTICLES, type TechArticle } from "@/data/tech-articles";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import type { ConceptHistoryEntry } from "@/types/briefing";

/**
 * 상식 후보 모으기. 순수 함수만 둔다.
 *
 * 오늘의 주제는 AI 큐레이터가 고르지만, 무엇을 후보로 보여줄지와 고른 결과가 유효한지는 코드가 정한다.
 * 이미 다룬 개념·아티클은 후보에서 빼고, 분야와 난이도가 고루 보이도록 나눠 담는다.
 */

/** 큐레이터에게 보여주는 후보 한 줄. id 접두사로 출처를 구분한다. k- 커리큘럼 / a- 아티클 */
export type KnowledgeCandidate = {
  id: string;
  format: KnowledgeFormat;
  category: string;
  level: number;
  title: string;
  /** 무엇을 배울 수 있는가. 큐레이터 판단 재료 */
  note: string;
  concept?: Concept;
  article?: TechArticle;
};

/** 최근 며칠 동안 낸 상식. 큐레이터가 분야·형식·난이도 겹침에 감점하도록 보여준다. */
export type RecentKnowledge = { briefingDate: string; title: string; category?: string; format?: string; level?: number };

export function recentKnowledge(history: ConceptHistoryEntry[], days = 7): RecentKnowledge[] {
  return history.slice(0, days).flatMap((entry) =>
    entry.items.map((item) => ({ briefingDate: entry.briefingDate, title: item.title, category: item.category, format: item.format, level: item.level })),
  );
}

function learned(history: ConceptHistoryEntry[]) {
  return {
    slugs: new Set(history.flatMap((entry) => entry.items.map((item) => item.slug))),
    urls: new Set(history.flatMap((entry) => entry.items.map((item) => item.url).filter((url): url is string => !!url))),
  };
}

/** 분야마다 앞에서부터 perCategory개씩(분야별로 다르게 줄 수 있다). 커리큘럼 안 순서(쉬운 것부터)를 지키면서 분야를 고루 담는다. */
function spread<T extends { category: string }>(items: T[], perCategory: number | ((category: string) => number)): T[] {
  const counts = new Map<string, number>();
  const limit = typeof perCategory === "number" ? () => perCategory : perCategory;
  return items.filter((item) => {
    const count = counts.get(item.category) ?? 0;
    if (count >= limit(item.category)) return false;
    counts.set(item.category, count + 1);
    return true;
  });
}

/**
 * 테크 상식의 두 축. 하루 두 개는 축마다 하나씩 고른다(2026-10-20 사용자 요청).
 *   engineering  CS·소프트웨어 엔지니어링(DB·운영체제·네트워크·아키텍처·API·인증·트랜잭션·동시성) + 프론트엔드
 *   ai-dx        AI·DX 실무(LLM·RAG·에이전트·AI 보안) + 클라우드·인프라·시스템 통합(backend)
 */
export const TECH_AXIS: Record<string, "engineering" | "ai-dx"> = { cs: "engineering", frontend: "engineering", ai: "ai-dx", backend: "ai-dx" };

export function techAxis(category: string): string {
  return TECH_AXIS[category] ?? category;
}

/**
 * 테크 상식 후보: 미학습 커리큘럼 개념(분야당 4개) + 아직 소개하지 않은 아티클 전부.
 * 프론트엔드는 경험 분야라 빼지 않되 한쪽으로 쏠리지 않게, 직전 지면에 프론트엔드가 있었으면 오늘은 후보에서 뺀다.
 */
export function techCandidates(history: ConceptHistoryEntry[]): KnowledgeCandidate[] {
  const seen = learned(history);
  const frontendLast = history[0]?.items.some((item) => item.category === "frontend") ?? false;
  const allowed = (category: string) => !(frontendLast && category === "frontend");
  const concepts = spread(TECH_CURRICULUM.filter((concept) => !seen.slugs.has(concept.slug) && allowed(concept.category)), 4).map((concept) => ({
    id: `k-${concept.slug}`,
    format: concept.format ?? ("concept" as const),
    category: concept.category,
    level: concept.level,
    title: concept.title,
    note: concept.references?.[0]?.title ?? "",
    concept: { ...concept, format: concept.format ?? ("concept" as const) },
  }));
  const articles = TECH_ARTICLES.filter((article) => !seen.slugs.has(article.slug) && !seen.urls.has(article.url) && allowed(article.category)).map((article) => ({
    id: article.slug,
    format: "article" as const,
    category: article.category,
    level: article.level,
    title: article.title,
    note: `${article.publisher} · ${article.takeaway}`,
    article,
  }));
  return [...concepts, ...articles];
}

/**
 * 경제 상식의 일곱 갈래. 커리큘럼 분류를 묶는다.
 * 큐레이터가 한쪽으로 쏠리지 않게 보는 기준이고, 지면에는 경제/증권/경영 칩으로 보인다.
 */
export const ECONOMY_GROUP: Record<string, string> = {
  "economy-basics": "경제 기초",
  macro: "경제정책·거시",
  "rates-bonds": "금융시장",
  "global-markets": "금융시장",
  "market-basics": "주식·증권 제도",
  "market-structure": "주식·증권 제도",
  "securities-business": "주식·증권 제도",
  products: "주식·증권 제도",
  "corporate-value": "투자 지표·가치평가",
  "financial-statements": "투자 지표·가치평가",
  risk: "투자 지표·가치평가",
  business: "경영",
  "digital-finance": "금융·IT 산업",
};

/** 경제 상식 갈래별로 후보에 올리는 수. 경제 기초는 지나치게 기초적인 개념이 많아 하나만 올린다(2026-10-20 사용자 요청: 후순위). */
const ECONOMY_PER_GROUP: Record<string, number> = { "경제 기초": 1 };
const ECONOMY_DEFAULT_PER_GROUP = 3;

/** 경제 상식 후보: 미학습 개념을 일곱 갈래에서 3개씩(경제 기초는 1개). 갈래 안에서는 커리큘럼 순서(쉬운 것부터)를 따른다. */
export function economyCandidates(history: ConceptHistoryEntry[]): KnowledgeCandidate[] {
  const seen = learned(history);
  const unseen = CURRICULUM.filter((concept) => !seen.slugs.has(concept.slug))
    .map((concept) => ({ ...concept, group: ECONOMY_GROUP[concept.category] ?? concept.category }));
  return spread(unseen.map((concept) => ({ ...concept, category: concept.group, original: concept.category })), (group) => ECONOMY_PER_GROUP[group] ?? ECONOMY_DEFAULT_PER_GROUP)
    .map((concept) => {
      const original = CURRICULUM.find((entry) => entry.slug === concept.slug) as Concept;
      return {
        id: `k-${concept.slug}`,
        format: "concept" as const,
        category: concept.group,
        level: concept.level,
        title: concept.title,
        note: "",
        concept: { ...original, format: "concept" as const },
      };
    });
}

/**
 * 큐레이터가 고르지 못했을 때 쓸 대체 후보. 사람이 검증한 커리큘럼 개념만 쓴다 (아티클은 쓰지 않는다).
 * 최근에 많이 나온 분야를 피하고, 같은 점수면 앞의 후보(쉬운 것)를 고른다.
 */
export function fallbackConcept(candidates: KnowledgeCandidate[], recent: RecentKnowledge[]): KnowledgeCandidate | undefined {
  const recentCategories = recent.map((entry) => ECONOMY_GROUP[entry.category ?? ""] ?? entry.category);
  const concepts = candidates.filter((candidate) => candidate.concept && candidate.id.startsWith("k-"));
  return [...concepts].sort((a, b) => recentCategories.filter((c) => c === a.category).length - recentCategories.filter((c) => c === b.category).length)[0];
}
