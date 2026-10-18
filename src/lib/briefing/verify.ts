import { SOURCE_MAX_AGE_HOURS } from "@/config/app";
import type { Concept } from "@/data/curriculum";
import { isFreshSource, type DateString } from "@/lib/date";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import { sourceMatchKey } from "@/lib/news/search-provenance";
import type {
  BriefingViolation,
  GroundedSection,
  KnowledgeItem,
  NewsIssue,
  RecentNewsEntry,
} from "@/types/briefing";

/**
 * 발행 기준.
 *
 * 스키마(schemas.ts)는 응답의 모양을 본다. 이 파일은 그 모양이 갖춰진 뒤
 * 오늘 지면에 올려도 되는 내용인지를 본다. 둘 다 통과해야 저장한다.
 *
 * 서버 전용 코드를 두지 않는다. 순수 함수만 두어야 테스트에서 부를 수 있다.
 */

/**
 * message는 그대로 재시도 프롬프트에 들어가므로 무엇을 어떻게 고칠지까지 쓰고,
 * code는 나중에 세어 보기 위한 분류다. 무엇이 재시도를 가장 많이 유발하는지
 * 알아야 기준을 고칠 수 있다.
 */
export type Violation = Omit<BriefingViolation, "attempt">;

export type VerifyContext = {
  date: DateString;
  concepts: Concept[];
  candidates?: GroundedCandidate[];
  /** IT 파트처럼 발행 하한선이 다른 파트만 넘긴다. */
  maxSourceAgeHours?: number;
  /** 최근 며칠 동안 실은 뉴스. 같은 기사를 출처로 다시 쓰면 후속 표시가 있어야 한다. */
  recentNews?: RecentNewsEntry[];
};

/**
 * 오늘 지면이 발행 기준을 지켰는가.
 * 위반을 한 번에 모아서 돌려준다. 한 번의 재시도로 전부 고칠 수 있도록.
 */
export function verifyBriefing(
  content: GroundedSection,
  { date, concepts, candidates, maxSourceAgeHours = SOURCE_MAX_AGE_HOURS, recentNews = [] }: VerifyContext,
): Violation[] {
  return [
    ...knowledgeViolations(content.knowledgeItems, concepts),
    ...freshnessViolations(content.newsItems, date, maxSourceAgeHours),
    ...duplicateViolations(content.newsItems, recentNews),
    ...(candidates ? evidenceViolations(content.newsItems, candidates) : []),
  ];
}

function evidenceViolations(items: NewsIssue[], candidates: GroundedCandidate[]): Violation[] {
  return items.flatMap((item) => {
    const evidence = item.evidence;
    const candidate = candidates.find((entry) => entry.id === evidence?.candidateId);
    if (!evidence || !candidate || evidence.facts.length === 0 || evidence.facts.some((fact) => {
      const original = candidate.facts.find((entry) => entry.id === fact.id);
      return !original || original.quote !== fact.quote || original.sourceId !== fact.sourceId;
    }) || item.whatHappened !== evidence.facts.map((fact) => fact.quote).join(" ")) {
      return [{ code: "news.evidence", message: `뉴스 ${item.rank}: 검증된 사실과 본문이 일치하지 않습니다.` }];
    }
    const expected = candidate.documents.filter((doc) => evidence.facts.some((fact) => fact.sourceId === doc.id));
    if (item.sources.length !== expected.length || item.sources.some((source, index) => {
      const actual = expected[index]?.source;
      return !actual || source.url !== actual.url || source.publishedAt !== actual.publishedAt || source.title !== actual.title || source.publisher !== actual.publisher;
    })) return [{ code: "news.source", message: `뉴스 ${item.rank}: 실제 수집한 출처 정보와 일치하지 않습니다.` }];
    // 해설에 새로운 숫자를 끼워 넣는 흔한 오류는 AI 검토 전에 차단한다.
    const numbers = (value: string) => value.match(/\d+(?:[,.]\d+)*/g) ?? [];
    // 실제로 수집한 기사 제목의 숫자(제품 버전, 연도 등)도 근거로 본다. 제목은 원문 페이지에서 읽은 값이다.
    const allowed = new Set([...evidence.facts.map((fact) => fact.quote), ...item.sources.map((source) => source.title)].flatMap(numbers));
    const written = [item.title, item.whyImportant, item.impact, ...Object.values(item.marketImpact), item.interpretation].filter((text): text is string => !!text).join(" ");
    const added = numbers(written).filter((number) => !allowed.has(number));
    return added.length ? [{ code: "news.unsupported_number", message: `뉴스 ${item.rank}: 선택한 근거에 없는 숫자 ${[...new Set(added)].join(", ")}를 삭제하세요.` }] : [];
  });
}

/**
 * 최근에 실은 기사와 같은 출처를 다시 쓰면서 후속 표시가 없으면 걸러낸다.
 * 같은 사건인지에 대한 최종 판단은 작성·검토 단계의 AI가 한다. 여기서는 가장 확실한 경우만 기계적으로 막는다.
 */
function duplicateViolations(items: NewsIssue[], recentNews: RecentNewsEntry[]): Violation[] {
  const seen = new Map<string, string>();
  for (const entry of recentNews) {
    for (const url of entry.urls) {
      const key = sourceMatchKey(url);
      if (key) seen.set(key, entry.title);
    }
  }
  return items.flatMap((item) => {
    if (item.followUp) return [];
    const repeated = item.sources.map((source) => seen.get(sourceMatchKey(source.url) ?? "")).find(Boolean);
    return repeated
      ? [{ code: "news.duplicate", message: `뉴스 ${item.rank}: 최근에 실은 "${repeated}"와 같은 기사를 출처로 씁니다. 같은 사건이면 followUp에 그 제목을 적고 새로 바뀐 점만 쓰거나, 다른 이슈로 바꾸세요.` }]
      : [];
  });
}

/**
 * 검증을 통과한 지면을 저장 형태로 다듬는다.
 *
 * AI 응답을 그대로 신뢰하지 않는 지점이다.
 * 프롬프트로도 같은 지시를 하지만, 최종 값은 코드가 정한다.
 */
export function normalizeBriefing<T extends GroundedSection>(
  content: T,
  { concepts }: Pick<VerifyContext, "concepts">,
): T {
  return {
    ...content,
    knowledgeItems: applyConceptIdentity(content.knowledgeItems, concepts),
    newsItems: orderNewsIssues(content.newsItems),
  };
}

/**
 * 오늘 다룰 개념은 코드가 정한다. (select-next-concepts.ts)
 * AI가 정말 그 개념을 설명했는지 확인한다.
 *
 * slug는 DB에 학습 이력으로 남아 다음 날 출제를 결정한다.
 * AI가 적어 보낸 값을 그대로 저장하면 그 개념은 영원히 미학습으로 남아
 * 매일 다시 출제된다. 예외가 나지 않으므로 눈에도 띄지 않는다.
 */
function knowledgeViolations(
  items: KnowledgeItem[],
  concepts: Concept[],
): Violation[] {
  if (items.length !== concepts.length) {
    return [
      {
        code: "knowledge.count",
        message: `- knowledgeItems: 오늘 다룰 개념은 ${concepts.length}개인데 ${items.length}개를 작성했습니다. 전달한 개념만 그 개수대로 작성하세요.`,
      },
    ];
  }

  const received = new Set(items.map((item) => item.slug));

  if (concepts.every((concept) => received.has(concept.slug))) return [];

  return [
    {
      code: "knowledge.slug",
      message: `- knowledgeItems.slug: 전달한 개념(${concepts
        .map((c) => c.slug)
        .join(", ")}) 대신 다른 값(${items
        .map((i) => i.slug)
        .join(", ")})을 썼습니다. slug는 전달받은 값을 그대로 사용하세요.`,
    },
  ];
}

/**
 * 뉴스마다 게시 시각이 확인된 최신 출처가 하나는 있어야 한다. (명세 §12)
 *
 * 모든 출처에 요구하지는 않는다. 배경 설명용 원문이나 게시 시각을 알 수 없는
 * 공식 자료가 함께 붙기 때문이다. 다만 하나도 없다면 그 이슈를 오늘 일로
 * 올릴 근거가 없다.
 */
function freshnessViolations(items: NewsIssue[], date: DateString, maxAgeHours: number): Violation[] {
  return items.flatMap((item, index) =>
    item.sources.some((source) => isFreshSource(source.publishedAt, date, maxAgeHours))
      ? []
      : [
          {
            code: "news.freshness",
            message: `- newsItems.${index}.sources: "${item.title}"에 최근 ${maxAgeHours}시간 이내에 게시된 출처가 없습니다. publishedAt을 기사 게시 시각으로 정확히 적거나, 오늘 새로 보도된 기사를 인용하세요.`,
          },
        ],
  );
}

/**
 * 식별 정보를 curriculum 값으로 되돌린다.
 * 설명은 AI가 쓰지만, 무엇을 설명한 것인지는 커리큘럼이 정한다.
 *
 * knowledgeViolations를 먼저 통과했다는 전제로 동작한다.
 */
function applyConceptIdentity(
  items: KnowledgeItem[],
  concepts: Concept[],
): KnowledgeItem[] {
  const bySlug = new Map(items.map((item) => [item.slug, item]));

  return concepts.map((concept) => ({
    ...(bySlug.get(concept.slug) as KnowledgeItem),
    slug: concept.slug,
    title: concept.title,
    level: concept.level,
    category: concept.category,
    ...(concept.references?.length ? { references: concept.references } : {}),
    ...(concept.format ? { format: concept.format } : {}),
  }));
}

/**
 * AI가 매긴 중요도 순서(rank)대로 정렬하고 1부터 다시 매긴다.
 * 지역이나 분야로 다시 줄 세우지 않는다. 그날 가장 중요한 사건이 맨 앞이다.
 */
function orderNewsIssues(items: NewsIssue[]): NewsIssue[] {
  return [...items]
    .sort((a, b) => a.rank - b.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
