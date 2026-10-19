import "server-only";
import type { Concept } from "@/data/curriculum";
import {
  normalizeBriefing,
  verifyBriefing,
  type Violation,
} from "@/lib/briefing/verify";
import type { DateString } from "@/lib/date";
import { getModel, getOpenAI, timeoutForItems } from "@/lib/openai/client";
import { buildBriefingPrompt, buildTechSectionPrompt } from "@/lib/openai/prompts";
import {
  aiDailyBriefingSchema,
  aiTechKnowledgeSchema,
  dailyBriefingSchema,
  stripNulls,
  techSectionSchema,
} from "@/lib/openai/schemas";
import type {
  BriefingViolation,
  DailyBriefingContent,
  GroundedSection,
  RecentNewsEntry,
  TechSection,
} from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { materializeBriefing } from "@/lib/briefing/materialize";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import { reviewViolations, tagSafeText, type GroundingReview } from "@/lib/news/review";
import { reviewBriefing } from "@/lib/openai/review-briefing";

export type ReviewRecord = { attempt: number; review: GroundingReview };

/** 2회 모두 통과하지 못했다. 위반 내역을 로그에 남기려고 함께 들고 나간다. */
export class BriefingValidationError extends Error {
  constructor(
    readonly violations: BriefingViolation[],
    lastError: string,
    readonly usage = { inputTokens: 0, outputTokens: 0 },
    readonly reviews: ReviewRecord[] = [],
  ) {
    super(`브리핑 검증 실패:\n${lastError}`);
    this.name = "BriefingValidationError";
  }
}

export type GenerateBriefingParams = {
  date: DateString;
  concepts: Concept[];
  /** 커리큘럼을 한 바퀴 돈 뒤라 모든 개념이 복습이면 "review". 설명 방식이 달라진다. */
  mode: "new" | "review";
  /**
   * 복습으로 고른 개념의 slug. 새 개념과 복습이 섞인 날(테크 상식) 복습 안내를 이 항목에만 준다.
   * 넘기지 않으면 mode를 따른다(review면 모두 복습, new면 모두 새 개념).
   */
  reviewSlugs?: string[];
  candidates: GroundedCandidate[];
  learnedTitles: string[];
  /** 발행 하한선. 넘기지 않으면 경제 파트 기준(SOURCE_MAX_AGE_HOURS)이다. */
  maxSourceAgeHours?: number;
  /** 최근 며칠 동안 실은 뉴스. 작성·검증·검토가 같은 사건 반복을 막는 데 쓴다. */
  recentNews?: RecentNewsEntry[];
  signal?: AbortSignal;
};

export type GenerateBriefingResult<C extends GroundedSection = DailyBriefingContent> = {
  content: C;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
  /** 성공까지 걸린 위반 내역. 한 번에 통과했다면 비어 있다. */
  violations: BriefingViolation[];
  reviews: ReviewRecord[];
};

/** 작성 호출. 제한 시간은 한 번에 쓰는 상식 항목 수(items)에 맞춘다. */
function draftWriter(schema: z.ZodType, name: string, items: number): GenerateBriefingDependencies["write"] {
  return async (input, signal) => {
    const response = await getOpenAI().responses.parse({
      model: getModel(), input,
      text: { format: zodTextFormat(schema, name) },
    }, { timeout: timeoutForItems(items), maxRetries: 0, signal });
    return { draft: response.output_parsed, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
  };
}

export type GenerateBriefingDependencies = {
  write: (input: string, signal?: AbortSignal) => Promise<{ draft: unknown; inputTokens: number; outputTokens: number }>;
  review: typeof reviewBriefing;
};

/** STEP 2 — 경제 본문(경제 상식·주요 이슈·키워드·한 줄) 생성. */
export function generateDailyBriefing(
  params: GenerateBriefingParams,
  dependencies: GenerateBriefingDependencies = { write: draftWriter(aiDailyBriefingSchema, "daily_briefing", params.concepts.length), review: reviewBriefing },
): Promise<GenerateBriefingResult> {
  return generateGroundedSection({
    prompt: buildBriefingPrompt(params), aiSchema: aiDailyBriefingSchema, schema: dailyBriefingSchema,
    materialize: (draft, candidates) => materializeBriefing(draft, candidates), requireCandidates: true,
  }, params, dependencies);
}

/**
 * STEP 2 — 테크 상식 생성. 뉴스는 쓰지 않는다.
 * 하루 상식 여러 개를 한 번에 쓴다. 아티클·트렌드 항목이면 candidates에 서버가 읽은 그 항목의 원문이 들어 있고,
 * 작성·검토 단계가 항목마다 자기 원문(knowledgeSlug가 같은 원문)만 근거로 본다. 개념 항목은 원문이 없다.
 */
export async function generateTechSection(
  params: GenerateBriefingParams,
  dependencies: GenerateBriefingDependencies = { write: draftWriter(aiTechKnowledgeSchema, "tech_knowledge", params.concepts.length), review: reviewBriefing },
): Promise<GenerateBriefingResult<TechSection>> {
  const attributed = { ...params, candidates: attributeKnowledgeSources(params.concepts, params.candidates) };
  return generateGroundedSection({
    prompt: buildTechSectionPrompt(attributed), aiSchema: aiTechKnowledgeSchema, schema: techSectionSchema,
    materialize: (draft) => ({ knowledgeItems: draft.knowledgeItems, newsItems: [] }), requireCandidates: false,
    // 재시도 문구(검토 사유·AI가 쓴 글)도 원문 태그 뒤에 붙으므로 태그를 위장하지 못하게 이스케이프한다.
    retryNote: tagSafeText,
  }, attributed, dependencies);
}

/**
 * 테크 상식 원문마다 어느 상식의 근거인지(knowledgeSlug) 확정한다.
 * 상식이 하나면 표시 없는 원문은 그 상식의 것이다. 어느 상식의 것인지 알 수 없는 원문이 있으면 쓰지 않고 멈춘다.
 * 다른 항목의 원문으로 쓰거나 검토하면 근거 확인이 무의미해진다.
 * 반대로 아티클·트렌드 항목에 귀속된 원문이 없어도 쓰지 않고 멈춘다. 원문 없이 요약하면 근거 없는 글이 된다.
 */
function attributeKnowledgeSources(concepts: Concept[], candidates: GroundedCandidate[]): GroundedCandidate[] {
  const slugs = new Set(concepts.map((concept) => concept.slug));
  const attributed = candidates.map((candidate) => {
    const slug = candidate.knowledgeSlug ?? (concepts.length === 1 ? concepts[0].slug : undefined);
    if (!slug || !slugs.has(slug)) throw new Error(`원문 ${candidate.id}가 오늘 테크 상식 가운데 어느 항목의 근거인지 알 수 없습니다.`);
    return candidate.knowledgeSlug === slug ? candidate : { ...candidate, knowledgeSlug: slug };
  });
  const unsourced = concepts.filter((concept) =>
    (concept.format === "article" || concept.format === "trend") && !attributed.some((candidate) => candidate.knowledgeSlug === concept.slug));
  if (unsourced.length) throw new Error(`아티클·트렌드 항목 ${unsourced.map((concept) => concept.slug).join(", ")}에 귀속된 원문이 없습니다.`);
  return attributed;
}

type SectionSpec<D, C extends GroundedSection> = {
  prompt: string;
  /** structured output 모양 */
  aiSchema: z.ZodType<D>;
  /** 저장 전 canonical 검증 */
  schema: z.ZodType<C>;
  /** AI 초안을 저장 모양으로 바꾼다. 뉴스의 사실·출처는 여기서 서버가 조합한다. */
  materialize: (draft: D, candidates: GroundedCandidate[]) => unknown;
  /** 근거가 확보된 뉴스 후보가 있어야만 쓰는 섹션인가. */
  requireCandidates: boolean;
  /** 재시도 프롬프트에 붙이는 위반 문구를 다듬는다. 없으면 그대로 붙인다(경제 파트). */
  retryNote?: (text: string) => string;
};

/**
 * AI 응답을 그대로 신뢰하지 않는다.
 * 스키마(schemas.ts)로 모양을 보고, 발행 기준(verify.ts)으로 내용을 본다.
 * 어느 쪽이든 걸리면 무엇이 틀렸는지 알려주고 1회 재시도한다. (명세 §46)
 * 두 번째도 실패하면 저장하지 않고 던진다. 잘못된 데이터를 DB에 넣지 않는다.
 */
async function generateGroundedSection<D, C extends GroundedSection>(
  { prompt: basePrompt, aiSchema, schema, materialize, requireCandidates, retryNote = (text) => text }: SectionSpec<D, C>,
  params: GenerateBriefingParams,
  dependencies: GenerateBriefingDependencies,
): Promise<GenerateBriefingResult<C>> {
  if (requireCandidates && !params.candidates.length) throw new Error("근거가 확보된 뉴스가 없어 브리핑을 생성하지 않습니다.");

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "";

  // 재시도로 성공하더라도 1차에 무엇이 걸렸는지 남긴다.
  const history: BriefingViolation[] = [];
  const reviews: ReviewRecord[] = [];

  // 기본은 2번이다. 마지막 시도에서 키워드·한 줄·상식 설명(framing)만 걸렸다면 그 부분만 고칠 기회를 한 번 더 준다.
  let maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const final = attempt >= 2;
    const fail = (found: Violation[]) => {
      history.push(...found.map((violation) => ({ attempt, ...violation })));
      lastError = found.map((violation) => violation.message).join("\n");
    };

    const input =
      attempt === 1
        ? basePrompt
        : `${basePrompt}

## 재시도

직전 응답이 검증을 통과하지 못했다. 아래 문제를 고쳐서 다시 작성하라.

${retryNote(lastError)}`;

    let response;
    try {
      response = await dependencies.write(input, params.signal);
    } catch (error) {
      fail([{ code: "generation.unavailable", message: error instanceof Error ? error.message : String(error) }]);
      throw new BriefingValidationError(history, lastError, { inputTokens, outputTokens }, reviews);
    }
    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;
    const draft = aiSchema.safeParse(response.draft);
    if (!draft.success) {
      fail([{ code: "no_output", message: "구조화된 작성 결과를 받지 못했습니다." }]);
      continue;
    }

    let materialized;
    try {
      materialized = materialize(draft.data, params.candidates);
    } catch (error) {
      fail([{ code: "news.evidence", message: error instanceof Error ? error.message : String(error) }]);
      continue;
    }
    const parsed = schema.safeParse(stripNulls(materialized));

    if (!parsed.success) {
      fail(
        parsed.error.issues.map((issue) => ({
          code: `schema.${String(issue.path[0] ?? "root")}`,
          message: `- ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        })),
      );
      continue;
    }

    let content = parsed.data;
    const violations = verifyBriefing(content, params);

    if (violations.length > 0) {
      fail(violations);
      // 마지막 시도에서 특정 뉴스만 걸렸다면(숫자·출처·중복 등) 그 뉴스만 빼고 검토로 넘긴다.
      const trimmed = final && violations.every((violation) => violation.rank !== undefined)
        ? dropNewsByRank(content, new Set(violations.map((violation) => violation.rank as number)), schema)
        : null;
      if (!trimmed || verifyBriefing(trimmed, params).length > 0) continue;
      content = trimmed;
    }

    let reviewed;
    try {
      reviewed = await dependencies.review(content, params.candidates, params.date, params.signal, params.recentNews);
    } catch (error) {
      fail([{ code: "news.review_unavailable", message: error instanceof Error ? error.message : String(error) }]);
      throw new BriefingValidationError(history, lastError, { inputTokens, outputTokens }, reviews);
    }
    inputTokens += reviewed.inputTokens;
    outputTokens += reviewed.outputTokens;
    reviews.push({ attempt, review: reviewed.review });
    const unsupported = reviewViolations(content, reviewed.review);
    if (unsupported.length) {
      fail(unsupported);
      // 두 번째 시도에서 키워드·한 줄·상식 설명(framing)이 걸렸다면, 걸린 뉴스는 빼고 framing만 고칠 기회를 한 번 더 준다.
      const reviewOnly = unsupported.every((violation) => violation.code === "briefing.unsupported" || violation.code === "news.unsupported");
      if (attempt === 2 && reviewOnly && unsupported.some((violation) => violation.code === "briefing.unsupported")) {
        maxAttempts = 3;
        const dropped = unsupported.filter((violation) => violation.code === "news.unsupported").map((violation) => violation.message);
        lastError = [
          dropped.length ? `다음 뉴스는 근거 검토를 통과하지 못했다. 이번에는 싣지 않는다:\n${dropped.join("\n")}` : "뉴스 본문은 통과했다.",
          `아래 지적은 todayKeywords·oneLiner·knowledgeItems에 대한 것이다. 이 부분을 고치고, 나머지 뉴스는 그대로 둔다.`,
          ...unsupported.filter((violation) => violation.code === "briefing.unsupported").map((violation) => violation.message),
        ].join("\n");
        continue;
      }
      // 마지막 시도에서 특정 뉴스만 걸렸다면 그 뉴스만 빼고 발행한다.
      // 한 건 때문에 근거가 확인된 나머지 지면까지 버리지 않는다. 키워드·한 줄·전체 검토가 걸리면 빼지 않는다.
      const trimmed = final && unsupported.every((violation) => violation.code === "news.unsupported")
        ? dropNewsByRank(content, new Set(reviewed.review.news.filter((item) => !item.supported).map((item) => item.rank)), schema)
        : null;
      if (!trimmed) continue;
      content = trimmed;
    }

    return {
      content: normalizeBriefing(content, params),
      inputTokens,
      outputTokens,
      attempts: attempt,
      violations: history,
      reviews,
    };
  }

  throw new BriefingValidationError(history, lastError, { inputTokens, outputTokens }, reviews);
}

/**
 * 걸린 뉴스만 뺀 지면. 뺄 수 없으면 null.
 * 남은 뉴스가 스키마 최소 개수를 채워야 하고, 뺀 뒤에도 다시 검증을 거친다.
 */
function dropNewsByRank<C extends GroundedSection>(content: C, ranks: Set<number>, schema: z.ZodType<C>): C | null {
  if (ranks.size === 0) return null;
  const kept = schema.safeParse({ ...content, newsItems: content.newsItems.filter((item) => !ranks.has(item.rank)) });
  return kept.success ? kept.data : null;
}
