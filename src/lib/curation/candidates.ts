import { KNOWLEDGE_OVERLAP_DAYS } from "@/config/app";
import { CURRICULUM, type Concept, type KnowledgeFormat } from "@/data/curriculum";
import { LEGACY_SLUGS, OVERLAP_GROUPS } from "@/data/knowledge-overlaps";
import { TECH_ARTICLES, type TechArticle } from "@/data/tech-articles";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import { diffDays, type DateString } from "@/lib/date";
import type { ConceptHistoryEntry } from "@/types/briefing";

/**
 * 상식 후보 모으기. 순수 함수만 둔다.
 *
 * 오늘의 주제는 AI 큐레이터가 고르지만, 무엇을 후보로 보여줄지와 고른 결과가 유효한지는 코드가 정한다.
 * 이미 다룬 개념·아티클과, 최근 7일 안에 낸 상식과 학습 범위가 크게 겹치는 상식은 후보에서 빼고,
 * 분야와 난이도가 고루 보이도록 나눠 담는다.
 */

/** 지금 slug. 예전 커리큘럼 slug는 같은 개념의 지금 slug로 바꾼다(knowledge-overlaps.ts LEGACY_SLUGS). */
function canonicalSlug(slug: string): string {
  return LEGACY_SLUGS[slug] ?? slug;
}

/**
 * 예전 slug를 지금 slug로 바꾼 학습 이력. 미학습 판정·복습 순서(selectTodayConcepts)가 이 이력을 쓴다.
 * 바꾸지 않으면 예전 slug로 배운 개념이 새 개념처럼 다시 나간다.
 */
export function canonicalHistory(history: ConceptHistoryEntry[]): ConceptHistoryEntry[] {
  return history.map((entry) => ({ ...entry, items: entry.items.map((item) => ({ ...item, slug: canonicalSlug(item.slug) })) }));
}

/** 기준일보다 앞선 지면. 같은 날짜로 다시 만들 때 그날의 이전 지면을 '최근'으로 세지 않는다. */
function before(history: ConceptHistoryEntry[], date: DateString): ConceptHistoryEntry[] {
  return history.filter((entry) => entry.briefingDate < date);
}

/**
 * 최근 KNOWLEDGE_OVERLAP_DAYS일 안에 낸 상식과 학습 범위가 크게 겹치는 상식 slug(knowledge-overlaps.ts OVERLAP_GROUPS).
 * 후보와 대체·복습 풀에서 뺀다. 그 기간이 지나면 다시 고를 수 있다.
 */
export function recentOverlaps(history: ConceptHistoryEntry[], date: DateString): Set<string> {
  const recent = new Set(before(history, date)
    .filter((entry) => diffDays(entry.briefingDate, date) <= KNOWLEDGE_OVERLAP_DAYS)
    .flatMap((entry) => entry.items.map((item) => canonicalSlug(item.slug))));
  return new Set(OVERLAP_GROUPS.filter((group) => group.some((slug) => recent.has(slug))).flat());
}

/** 대체·복습에 쓸 커리큘럼. 최근 상식과 학습 범위가 크게 겹치는 개념은 뺀다. */
export function withoutRecentOverlaps<T extends { slug: string }>(curriculum: T[], history: ConceptHistoryEntry[], date: DateString): T[] {
  const overlapping = recentOverlaps(history, date);
  return curriculum.filter((concept) => !overlapping.has(concept.slug));
}

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
    slugs: new Set(history.flatMap((entry) => entry.items.map((item) => canonicalSlug(item.slug)))),
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
 * 테크 상식의 두 축. 하루 두 개는 축마다 하나씩, 반드시 싣는다(2026-10-20 사용자 결정).
 *   frontend  프론트엔드. 매일 하나
 *   core      CS·소프트웨어 엔지니어링(cs)·백엔드·클라우드(backend)·AI(ai) 가운데 하나
 */
export const TECH_AXIS: Record<string, "frontend" | "core"> = { frontend: "frontend", cs: "core", backend: "core", ai: "core" };

/** 하루에 꼭 하나씩 싣는 테크 상식 축. 대체·복습으로 채울 때 이 순서로 채운다(지면 순서) */
export const TECH_GROUPS = ["core", "frontend"] as const;

export function techAxis(category: string): string {
  return TECH_AXIS[category] ?? category;
}

/**
 * 테크 상식 나머지 축(CS·백엔드·AI)에서 최근 지면에 나온 분야. 거슬러 올라가며 서로 다른 분야를 count개까지 모은다.
 * 두 분야를 쉬게 하면 가장 오래 안 나온 한 분야만 남아 세 분야가 돌아가며 나온다(2026-10-22 사용자 요청: 영역이 고르게).
 * 큐레이터에게 맡겼을 때는 아티클이 많은 CS·AI만 이어지고 백엔드·클라우드는 10-18~22 닷새 동안 한 번도 나오지 않았다.
 */
function recentCoreCategories(history: ConceptHistoryEntry[], date: DateString, count: number): Set<string> {
  const seen: string[] = [];
  for (const entry of before(history, date)) {
    const core = entry.items.map((item) => item.category).find((category): category is string => !!category && TECH_AXIS[category] === "core");
    if (core && !seen.includes(core)) seen.push(core);
    if (seen.length >= count) break;
  }
  return new Set(seen);
}

/**
 * 테크 상식 후보: 미학습 커리큘럼 개념(분야당 4개) + 아직 소개하지 않은 아티클 전부.
 * 최근 7일 안에 낸 상식과 학습 범위가 크게 겹치는 상식은 뺀다.
 * 나머지 축은 최근 두 지면에 나온 분야를 쉬게 한다. 쉬고 나니 나머지 축 후보가 없으면(그 분야를 다 배웠으면) 가장 최근 분야만 쉬고, 그래도 없으면 쉬지 않는다.
 */
export function techCandidates(history: ConceptHistoryEntry[], date: DateString): KnowledgeCandidate[] {
  const seen = learned(history);
  const overlapping = recentOverlaps(history, date);
  const open = (slug: string) => !seen.slugs.has(slug) && !overlapping.has(slug);
  const concepts = spread(TECH_CURRICULUM.filter((concept) => open(concept.slug)), 4).map((concept) => ({
    id: `k-${concept.slug}`,
    format: concept.format ?? ("concept" as const),
    category: concept.category,
    level: concept.level,
    title: concept.title,
    note: concept.references?.[0]?.title ?? "",
    concept: { ...concept, format: concept.format ?? ("concept" as const) },
  }));
  const articles = TECH_ARTICLES.filter((article) => open(article.slug) && !seen.urls.has(article.url)).map((article) => ({
    id: article.slug,
    format: "article" as const,
    category: article.category,
    level: article.level,
    title: article.title,
    note: `${article.publisher} · ${article.takeaway}`,
    article,
  }));
  const all: KnowledgeCandidate[] = [...concepts, ...articles];
  for (const count of [2, 1]) {
    const resting = recentCoreCategories(history, date, count);
    const rested = all.filter((candidate) => !resting.has(candidate.category));
    if (rested.some((candidate) => techAxis(candidate.category) === "core")) return rested;
  }
  return all;
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

/**
 * 경제 상식 갈래별로 후보에 올리는 수(2026-10-20 사용자 결정).
 * 경제 기초는 지나치게 기초적인 개념이 많아, 금융·IT 산업은 중심이 아니라 가산 요소라 하나씩만 올린다.
 */
const ECONOMY_PER_GROUP: Record<string, number> = { "경제 기초": 1, "금융·IT 산업": 1 };
const ECONOMY_DEFAULT_PER_GROUP = 3;

/** 금융·IT 산업 갈래를 쉬는 기간(최근 지면 수). 이 안에 그 갈래가 나왔으면 후보에 올리지 않는다. 일주일에 두 번 안쪽이 되게 한다. */
const DIGITAL_FINANCE_COOLDOWN = 3;

/**
 * 경제 상식 후보: 미학습 개념을 일곱 갈래에서 3개씩(경제 기초·금융·IT 산업은 1개). 갈래 안에서는 커리큘럼 순서(쉬운 것부터)를 따른다.
 * 금융·IT 산업은 최근 지면에 나왔으면 쉰다. 경제 뉴스를 이해하는 개념(금융시장·거시경제·투자·기업 재무)이 중심이다.
 * 최근 7일 안에 낸 상식과 학습 범위가 크게 겹치는 개념(인플레이션 → CPI 등)은 뺀다.
 */
export function economyCandidates(history: ConceptHistoryEntry[], date: DateString): KnowledgeCandidate[] {
  const seen = learned(history);
  const overlapping = recentOverlaps(history, date);
  const resting = before(history, date).slice(0, DIGITAL_FINANCE_COOLDOWN)
    .some((entry) => entry.items.some((item) => ECONOMY_GROUP[item.category ?? ""] === "금융·IT 산업"));
  const perGroup = (group: string) => (resting && group === "금융·IT 산업" ? 0 : (ECONOMY_PER_GROUP[group] ?? ECONOMY_DEFAULT_PER_GROUP));
  const unseen = CURRICULUM.filter((concept) => !seen.slugs.has(concept.slug) && !overlapping.has(concept.slug))
    .map((concept) => ({ ...concept, group: ECONOMY_GROUP[concept.category] ?? concept.category }));
  return spread(unseen.map((concept) => ({ ...concept, category: concept.group, original: concept.category })), perGroup)
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
