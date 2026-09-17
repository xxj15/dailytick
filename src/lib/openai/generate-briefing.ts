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
  KnowledgeItem,
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

type AlignResult =
  | { ok: true; items: KnowledgeItem[] }
  | { ok: false; message: string };

/**
 * 오늘 다룰 개념은 코드가 정한다. (select-next-concepts.ts)
 * AI가 정말 그 개념을 설명했는지 확인하고, 식별 정보는 curriculum 값으로 되돌린다.
 *
 * slug는 DB에 학습 이력으로 남아 다음 날 출제를 결정한다.
 * AI가 적어 보낸 값을 그대로 저장하면 그 개념은 영원히 미학습으로 남아
 * 매일 다시 출제된다. 에러가 나지 않으므로 눈에도 띄지 않는다.
 */
function alignKnowledgeItems(
  items: KnowledgeItem[],
  concepts: CurriculumConcept[],
): AlignResult {
  if (items.length !== concepts.length) {
    return {
      ok: false,
      message: `- knowledgeItems: 오늘 다룰 개념은 ${concepts.length}개인데 ${items.length}개를 작성했습니다. 전달한 개념만 그 개수대로 작성하세요.`,
    };
  }

  const bySlug = new Map(items.map((item) => [item.slug, item]));

  const aligned = concepts.map((concept) => {
    const item = bySlug.get(concept.slug);
    if (!item) return null;

    // 설명은 AI가 쓰지만, 무엇을 설명한 것인지는 curriculum이 정한다.
    return {
      ...item,
      slug: concept.slug,
      title: concept.title,
      level: concept.level,
      category: concept.category,
    };
  });

  if (aligned.some((item) => item === null)) {
    const expected = concepts.map((c) => c.slug).join(", ");
    const received = items.map((i) => i.slug).join(", ");

    return {
      ok: false,
      message: `- knowledgeItems.slug: 전달한 개념(${expected}) 대신 다른 값(${received})을 썼습니다. slug는 전달받은 값을 그대로 사용하세요.`,
    };
  }

  return { ok: true, items: aligned as KnowledgeItem[] };
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
 * AI 응답을 그대로 신뢰하지 않는다. 반드시 canonical 스키마 검증을 통과하고,
 * 코드가 정한 개념을 설명했는지까지 확인해야 한다.
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

    if (!parsed.success) {
      lastError = parsed.error.issues
        .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      continue;
    }

    const knowledge = alignKnowledgeItems(
      parsed.data.knowledgeItems,
      params.concepts,
    );

    if (!knowledge.ok) {
      lastError = knowledge.message;
      continue;
    }

    return {
      content: {
        ...parsed.data,
        knowledgeItems: knowledge.items,
        newsItems: orderNewsIssues(parsed.data.newsItems),
      },
      inputTokens,
      outputTokens,
      attempts: attempt,
    };
  }

  throw new Error(`브리핑 검증 실패(2회 시도):\n${lastError}`);
}
