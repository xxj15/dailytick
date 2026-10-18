import "server-only";
import type { Concept } from "@/data/curriculum";
import {
  normalizeBriefing,
  verifyBriefing,
  type Violation,
} from "@/lib/briefing/verify";
import type { DateString } from "@/lib/date";
import { getModel, getOpenAI } from "@/lib/openai/client";
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
import { reviewViolations, type GroundingReview } from "@/lib/news/review";
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
  /** 커리큘럼을 한 바퀴 돈 뒤라면 "review". 설명 방식이 달라진다. */
  mode: "new" | "review";
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

function draftWriter(schema: z.ZodType, name: string): GenerateBriefingDependencies["write"] {
  return async (input, signal) => {
    const response = await getOpenAI().responses.parse({
      model: getModel(), input,
      text: { format: zodTextFormat(schema, name) },
    }, { timeout: 60_000, maxRetries: 0, signal });
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
  dependencies: GenerateBriefingDependencies = { write: draftWriter(aiDailyBriefingSchema, "daily_briefing"), review: reviewBriefing },
): Promise<GenerateBriefingResult> {
  return generateGroundedSection({
    prompt: buildBriefingPrompt(params), aiSchema: aiDailyBriefingSchema, schema: dailyBriefingSchema,
    materialize: (draft, candidates) => materializeBriefing(draft, candidates), requireCandidates: true,
  }, params, dependencies);
}

/**
 * STEP 2 — 테크 상식 생성. 뉴스는 쓰지 않는다.
 * 아티클·트렌드면 candidates에 서버가 읽은 원문이 들어 있고, 검토 단계가 요약을 그 원문과 대조한다.
 */
export function generateTechSection(
  params: GenerateBriefingParams,
  dependencies: GenerateBriefingDependencies = { write: draftWriter(aiTechKnowledgeSchema, "tech_knowledge"), review: reviewBriefing },
): Promise<GenerateBriefingResult<TechSection>> {
  return generateGroundedSection({
    prompt: buildTechSectionPrompt(params), aiSchema: aiTechKnowledgeSchema, schema: techSectionSchema,
    materialize: (draft) => ({ knowledgeItems: draft.knowledgeItems, newsItems: [] }), requireCandidates: false,
  }, params, dependencies);
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
};

/**
 * AI 응답을 그대로 신뢰하지 않는다.
 * 스키마(schemas.ts)로 모양을 보고, 발행 기준(verify.ts)으로 내용을 본다.
 * 어느 쪽이든 걸리면 무엇이 틀렸는지 알려주고 1회 재시도한다. (명세 §46)
 * 두 번째도 실패하면 저장하지 않고 던진다. 잘못된 데이터를 DB에 넣지 않는다.
 */
async function generateGroundedSection<D, C extends GroundedSection>(
  { prompt: basePrompt, aiSchema, schema, materialize, requireCandidates }: SectionSpec<D, C>,
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

  for (let attempt = 1; attempt <= 2; attempt++) {
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

${lastError}`;

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
      const trimmed = attempt === 2 && violations.every((violation) => violation.rank !== undefined)
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
      // 마지막 시도에서 특정 뉴스만 걸렸다면 그 뉴스만 빼고 발행한다.
      // 한 건 때문에 근거가 확인된 나머지 지면까지 버리지 않는다. 키워드·한 줄·전체 검토가 걸리면 빼지 않는다.
      const trimmed = attempt === 2 && unsupported.every((violation) => violation.code === "news.unsupported")
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
