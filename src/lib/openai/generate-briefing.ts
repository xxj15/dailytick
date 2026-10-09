import "server-only";
import type { CurriculumConcept } from "@/data/curriculum";
import {
  normalizeBriefing,
  verifyBriefing,
  type Violation,
} from "@/lib/briefing/verify";
import type { DateString } from "@/lib/date";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildBriefingPrompt } from "@/lib/openai/prompts";
import {
  aiDailyBriefingSchema,
  dailyBriefingSchema,
  stripNulls,
} from "@/lib/openai/schemas";
import type {
  BriefingViolation,
  DailyBriefingContent,
} from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";
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
  concepts: CurriculumConcept[];
  /** 커리큘럼을 한 바퀴 돈 뒤라면 "review". 설명 방식이 달라진다. */
  mode: "new" | "review";
  candidates: GroundedCandidate[];
  learnedTitles: string[];
  signal?: AbortSignal;
};

export type GenerateBriefingResult = {
  content: DailyBriefingContent;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
  /** 성공까지 걸린 위반 내역. 한 번에 통과했다면 비어 있다. */
  violations: BriefingViolation[];
  reviews: ReviewRecord[];
};

async function writeDraft(input: string, signal?: AbortSignal) {
  const response = await getOpenAI().responses.parse({
    model: getModel(), input,
    text: { format: zodTextFormat(aiDailyBriefingSchema, "daily_briefing") },
  }, { timeout: 60_000, maxRetries: 0, signal });
  return { draft: response.output_parsed, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export type GenerateBriefingDependencies = {
  write: (input: string, signal?: AbortSignal) => Promise<{ draft: unknown; inputTokens: number; outputTokens: number }>;
  review: typeof reviewBriefing;
};

/**
 * STEP 2 — Daily Briefing 생성.
 *
 * AI 응답을 그대로 신뢰하지 않는다.
 * 스키마(schemas.ts)로 모양을 보고, 발행 기준(verify.ts)으로 내용을 본다.
 * 어느 쪽이든 걸리면 무엇이 틀렸는지 알려주고 1회 재시도한다. (명세 §46)
 * 두 번째도 실패하면 저장하지 않고 던진다. 잘못된 데이터를 DB에 넣지 않는다.
 */
export async function generateDailyBriefing(
  params: GenerateBriefingParams,
  dependencies: GenerateBriefingDependencies = { write: writeDraft, review: reviewBriefing },
): Promise<GenerateBriefingResult> {
  if (!params.candidates.length) throw new Error("근거가 확보된 뉴스가 없어 브리핑을 생성하지 않습니다.");
  const basePrompt = buildBriefingPrompt(params);

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
    const draft = aiDailyBriefingSchema.safeParse(response.draft);
    if (!draft.success) {
      fail([{ code: "no_output", message: "구조화된 작성 결과를 받지 못했습니다." }]);
      continue;
    }

    let materialized;
    try {
      materialized = materializeBriefing(draft.data, params.candidates);
    } catch (error) {
      fail([{ code: "news.evidence", message: error instanceof Error ? error.message : String(error) }]);
      continue;
    }
    const parsed = dailyBriefingSchema.safeParse(stripNulls(materialized));

    if (!parsed.success) {
      fail(
        parsed.error.issues.map((issue) => ({
          code: `schema.${String(issue.path[0] ?? "root")}`,
          message: `- ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        })),
      );
      continue;
    }

    const violations = verifyBriefing(parsed.data, params);

    if (violations.length > 0) {
      fail(violations);
      continue;
    }

    let reviewed;
    try {
      reviewed = await dependencies.review(parsed.data, params.candidates, params.date, params.signal);
    } catch (error) {
      fail([{ code: "news.review_unavailable", message: error instanceof Error ? error.message : String(error) }]);
      throw new BriefingValidationError(history, lastError, { inputTokens, outputTokens }, reviews);
    }
    inputTokens += reviewed.inputTokens;
    outputTokens += reviewed.outputTokens;
    reviews.push({ attempt, review: reviewed.review });
    const unsupported = reviewViolations(parsed.data, reviewed.review);
    if (unsupported.length) {
      fail(unsupported);
      continue;
    }

    return {
      content: normalizeBriefing(parsed.data, params),
      inputTokens,
      outputTokens,
      attempts: attempt,
      violations: history,
      reviews,
    };
  }

  throw new BriefingValidationError(history, lastError, { inputTokens, outputTokens }, reviews);
}
