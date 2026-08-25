import "server-only";
import type { CurriculumConcept } from "@/data/curriculum";
import type { DateString } from "@/lib/date";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildBriefingPrompt } from "@/lib/openai/prompts";
import {
  aiDailyBriefingSchema,
  dailyBriefingSchema,
  stripNulls,
} from "@/lib/openai/schemas";
import type {
  DailyBriefingContent,
  NewsCandidate,
  NewsIssue,
} from "@/types/briefing";
import { zodTextFormat } from "openai/helpers/zod";

/**
 * 국내(KR) 이슈를 앞, 글로벌(GLOBAL) 이슈를 뒤로 정렬하고 rank를 1부터 다시 매긴다.
 * 같은 지역 안에서는 AI가 매긴 시장 영향도 순서를 그대로 둔다.
 *
 * 프롬프트로도 같은 지시를 하지만, AI 응답을 그대로 신뢰하지 않는다.
 */
function orderNewsIssues(items: NewsIssue[]): NewsIssue[] {
  const byRank = [...items].sort((a, b) => a.rank - b.rank);

  return [
    ...byRank.filter((item) => item.region === "KR"),
    ...byRank.filter((item) => item.region !== "KR"),
  ].map((item, index) => ({ ...item, rank: index + 1 }));
}

export type GenerateBriefingParams = {
  date: DateString;
  concepts: CurriculumConcept[];
  /** 커리큘럼을 한 바퀴 돈 뒤라면 "review". 설명 방식이 달라진다. */
  mode: "new" | "review";
  candidates: NewsCandidate[];
  learnedTitles: string[];
};

export type GenerateBriefingResult = {
  content: DailyBriefingContent;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
};

/**
 * STEP 2 — Daily Briefing 생성.
 *
 * AI 응답을 그대로 신뢰하지 않는다. 반드시 canonical 스키마 검증을 통과해야 한다.
 * 검증에 실패하면 무엇이 틀렸는지 알려주고 1회 재시도한다. (명세 §46)
 * 두 번째도 실패하면 저장하지 않고 던진다. 잘못된 데이터를 DB에 넣지 않는다.
 */
export async function generateDailyBriefing(
  params: GenerateBriefingParams,
): Promise<GenerateBriefingResult> {
  const basePrompt = buildBriefingPrompt(params);

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const input =
      attempt === 1
        ? basePrompt
        : `${basePrompt}

## 재시도

직전 응답이 검증을 통과하지 못했다. 아래 문제를 고쳐서 다시 작성하라.

${lastError}`;

    const response = await getOpenAI().responses.parse({
      model: getModel(),
      input,
      text: {
        format: zodTextFormat(aiDailyBriefingSchema, "daily_briefing"),
      },
    });

    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;

    if (!response.output_parsed) {
      lastError = "구조화된 응답을 받지 못했습니다.";
      continue;
    }

    const parsed = dailyBriefingSchema.safeParse(
      stripNulls(response.output_parsed),
    );

    if (parsed.success) {
      return {
        content: {
          ...parsed.data,
          newsItems: orderNewsIssues(parsed.data.newsItems),
        },
        inputTokens,
        outputTokens,
        attempts: attempt,
      };
    }

    lastError = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
  }

  throw new Error(`브리핑 검증 실패(2회 시도):\n${lastError}`);
}
