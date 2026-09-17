import "server-only";
import {
  collectLearnedTitles,
  selectTodayConcepts,
} from "@/lib/curriculum/select-next-concepts";
import type { DateString } from "@/lib/date";
import { collectMarketNews } from "@/lib/openai/collect-news";
import {
  BriefingValidationError,
  generateDailyBriefing,
} from "@/lib/openai/generate-briefing";
import { getModel } from "@/lib/openai/client";
import { PROMPT_VERSION } from "@/lib/openai/prompts";
import {
  getBriefingByDate,
  getConceptHistory,
  saveBriefing,
} from "@/lib/supabase/briefings";
import {
  finishGenerationLog,
  startGenerationLog,
} from "@/lib/supabase/generation-logs";
import type { Briefing } from "@/types/briefing";

export type CreateBriefingResult = {
  briefing: Briefing;
  /** 이미 있던 브리핑을 그대로 반환했는가. */
  reused: boolean;
};

/**
 * 하루치 브리핑 생성 전체 흐름. (명세 §45)
 *
 *   과거 브리핑 조회 → 개념 선정 → 뉴스 수집 → 브리핑 생성 → 저장
 *
 * Cron route는 이 함수만 호출한다. 스케줄러를 바꿔도 이 로직은 그대로다.
 */
export async function createDailyBriefing(
  date: DateString,
  options: { force?: boolean } = {},
): Promise<CreateBriefingResult> {
  // 같은 날짜로 두 번 실행돼도 브리핑은 하나다.
  if (!options.force) {
    const existing = await getBriefingByDate(date);
    if (existing) return { briefing: existing, reused: true };
  }

  const logId = await startGenerationLog(date);

  try {
    const history = await getConceptHistory();

    // 커리큘럼을 모두 돌았으면 가장 오래된 개념부터 복습한다. 개념 없이 발행하지 않는다.
    const { concepts, mode } = selectTodayConcepts(history);
    const learnedTitles = collectLearnedTitles(history);

    const news = await collectMarketNews(date);

    const generated = await generateDailyBriefing({
      date,
      concepts,
      mode,
      candidates: news.candidates,
      learnedTitles,
    });

    // 복습일이면 화면에도 남긴다. AI 응답이 아니라 코드가 판단한 값이다.
    const content =
      mode === "review"
        ? {
            ...generated.content,
            knowledgeItems: generated.content.knowledgeItems.map((item) => ({
              ...item,
              review: true,
            })),
          }
        : generated.content;

    const briefing = await saveBriefing({
      date,
      content,
      model: getModel(),
      promptVersion: PROMPT_VERSION,
    });

    await finishGenerationLog(logId, {
      status: "success",
      inputTokens: news.inputTokens + generated.inputTokens,
      outputTokens: news.outputTokens + generated.outputTokens,
      webSearchCalls: news.webSearchCalls,
      attempts: generated.attempts,
      // 재시도로 통과했다면 1차에 무엇이 걸렸는지 여기에만 남는다.
      violations: generated.violations,
    });

    return { briefing, reused: false };
  } catch (error) {
    const violations =
      error instanceof BriefingValidationError ? error.violations : undefined;

    // 생성에 실패해도 기존 브리핑은 절대 지우지 않는다.
    await finishGenerationLog(logId, {
      status: "failed",
      attempts: violations?.[violations.length - 1]?.attempt,
      violations,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
