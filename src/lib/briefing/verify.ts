import { SOURCE_MAX_AGE_HOURS } from "@/config/app";
import type { Concept } from "@/data/curriculum";
import { isFreshSource, type DateString } from "@/lib/date";
import { isBackground, type GroundedCandidate } from "@/lib/news/evidence-types";
import { sourceMatchKey } from "@/lib/news/url-key";
import { SLOT_NAME, slotMismatch, slotOrder } from "@/lib/news/slots";
import type {
  BriefingViolation,
  GroundedSection,
  KnowledgeItem,
  NewsIssue,
  RecentNewsEntry,
  StoredNewsSlot,
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
    ...slotViolations(content.newsItems),
    ...freshnessViolations(content.newsItems, date, maxSourceAgeHours),
    ...duplicateViolations(content.newsItems, recentNews),
    ...(candidates ? evidenceViolations(content.newsItems, candidates) : []),
  ];
}

/**
 * 기사는 슬롯(주요 시사·경제·IT)마다 한 건, 서로 다른 사건이어야 한다.
 *
 * 걸린 뉴스는 rank로 가리킨다. 재시도로 고치고, 마지막 시도에서는 그 뉴스만 빼고 발행한다. 뺀 슬롯은 빈 슬롯이다.
 * 지면 순서대로 보며 앞 슬롯이 먼저 자리를 잡는다. 시사와 경제가 같은 사건이면 경제 쪽이 걸린다.
 * 슬롯에 맞지 않는 뉴스는 자리도 사건도 차지하지 않는다. 뒤에 오는 맞는 뉴스를 함께 버리지 않기 위해서다.
 * slot이 없는 뉴스(과거 row·테크 파트)는 슬롯 규칙을 보지 않는다.
 *
 * 재시도하는 모델은 직전 초안을 보지 못한다. 어느 기사인지 알 수 있도록 메시지에 후보 id와 제목을 함께 쓴다.
 */
function slotViolations(items: NewsIssue[]): Violation[] {
  const slots = new Map<StoredNewsSlot, NewsIssue>();
  const events = new Map<string, number>();
  return [...items].sort(bySlot).flatMap((item): Violation[] => {
    const mismatch = item.slot ? slotMismatch(item.slot, item) : null;
    if (mismatch) return [{ code: "news.slot_mismatch", rank: item.rank, message: `${newsLabel(item)}: ${mismatch}` }];

    const holder = item.slot ? slots.get(item.slot) : undefined;
    if (item.slot && holder !== undefined) {
      return [{
        code: "news.slot_duplicate", rank: item.rank,
        message: `${newsLabel(item)}: ${SLOT_NAME[item.slot]} 슬롯은 ${newsLabel(holder)}가 이미 차지했습니다. 슬롯마다 한 건만 싣습니다. 비어 있는 슬롯에 맞는 다른 사건으로 바꾸고, 맞는 후보가 없으면 이 뉴스를 빼세요.`,
      }];
    }

    const candidateId = item.evidence?.candidateId;
    const same = candidateId ? events.get(candidateId) : undefined;
    if (same !== undefined) {
      return [{
        code: "news.same_event", rank: item.rank,
        message: `뉴스 ${item.rank}: 뉴스 ${same}와 같은 후보(${candidateId})를 다시 썼습니다. 슬롯마다 서로 다른 사건을 싣습니다. 이 슬롯에 맞는 다른 후보로 바꾸고, 없으면 이 뉴스를 빼세요.`,
      }];
    }

    if (item.slot) slots.set(item.slot, item);
    if (candidateId) events.set(candidateId, item.rank);
    return [];
  });
}

/** 재시도 메시지에서 뉴스를 가리키는 말. 예: 뉴스 3(후보 c4 "삼성전자 실적") */
function newsLabel(item: NewsIssue): string {
  const candidateId = item.evidence?.candidateId;
  return `뉴스 ${item.rank}(${candidateId ? `후보 ${candidateId} ` : ""}"${item.title}")`;
}

/** 슬롯 순서(주요 시사 → 경제 → IT), 같은 슬롯 안에서는 AI가 매긴 rank 순서. */
function bySlot(a: NewsIssue, b: NewsIssue): number {
  return slotOrder(a.slot) - slotOrder(b.slot) || a.rank - b.rank;
}

function evidenceViolations(items: NewsIssue[], candidates: GroundedCandidate[]): Violation[] {
  return items.flatMap((item) => {
    const evidence = item.evidence;
    const candidate = candidates.find((entry) => entry.id === evidence?.candidateId);
    // 무슨 일·왜 일어났나는 근거 문장을 역할대로 이은 값과 같아야 한다
    const joined = (background: boolean) => evidence?.facts.filter((fact) => isBackground(fact) === background).map((fact) => fact.quote).join(" ") || undefined;
    if (!evidence || !candidate || evidence.facts.length === 0 || evidence.facts.some((fact) => {
      const original = candidate.facts.find((entry) => entry.id === fact.id);
      return !original || original.quote !== fact.quote || original.sourceId !== fact.sourceId || isBackground(original) !== isBackground(fact);
    }) || item.whatHappened !== joined(false) || item.background !== joined(true)) {
      return [{ code: "news.evidence", rank: item.rank, message: `뉴스 ${item.rank}: 검증된 사실과 본문이 일치하지 않습니다.` }];
    }
    const expected = candidate.documents.filter((doc) => evidence.facts.some((fact) => fact.sourceId === doc.id));
    if (item.sources.length !== expected.length || item.sources.some((source, index) => {
      const actual = expected[index]?.source;
      return !actual || source.url !== actual.url || source.publishedAt !== actual.publishedAt || source.title !== actual.title || source.publisher !== actual.publisher;
    })) return [{ code: "news.source", rank: item.rank, message: `뉴스 ${item.rank}: 실제 수집한 출처 정보와 일치하지 않습니다.` }];
    // 해설에 새로운 숫자를 끼워 넣는 흔한 오류는 AI 검토 전에 차단한다.
    const numbers = (value: string) => value.match(/\d+(?:[,.]\d+)*/g) ?? [];
    // 실제로 수집한 기사 제목의 숫자(제품 버전, 연도 등)도 근거로 본다. 제목은 원문 페이지에서 읽은 값이다.
    const allowed = new Set([...evidence.facts.map((fact) => fact.quote), ...item.sources.map((source) => source.title)].flatMap(numbers));
    // 날짜 표현(2026년, 10월, 16일, 3분기)은 통계가 아니라서 검사에서 뺀다. 그 밖의 숫자는 근거에 있어야 한다.
    const written = [item.title, item.whyImportant, item.impact, ...Object.values(item.marketImpact), item.interpretation, item.takeaway]
      .filter((text): text is string => !!text)
      .join(" ")
      .replace(/\d{1,4}\s*(년|월|일|분기)/g, "");
    const added = numbers(written).filter((number) => !allowed.has(number));
    return added.length ? [{ code: "news.unsupported_number", rank: item.rank, message: `뉴스 ${item.rank}: 선택한 근거에 없는 숫자 ${[...new Set(added)].join(", ")}를 삭제하세요.` }] : [];
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
      ? [{ code: "news.duplicate", rank: item.rank, message: `뉴스 ${item.rank}: 최근에 실은 "${repeated}"와 같은 기사를 출처로 씁니다. 같은 사건이면 followUp에 그 제목을 적고 새로 바뀐 점만 쓰거나, 다른 이슈로 바꾸세요.` }]
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
            rank: item.rank,
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
 * 슬롯 순서(주요 시사 → 경제 → IT)대로 정렬하고 rank를 1부터 다시 매긴다.
 * 빈 슬롯은 건너뛰고 번호를 잇는다. AI가 매긴 rank는 순서의 근거로 쓰지 않는다.
 * slot이 없는 뉴스는 지금처럼 rank 순서다.
 */
function orderNewsIssues(items: NewsIssue[]): NewsIssue[] {
  return [...items]
    .sort(bySlot)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
