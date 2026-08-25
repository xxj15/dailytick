import "server-only";
import { CURRICULUM } from "@/data/curriculum";
import {
  collectLearnedSlugs,
  selectNextConcepts,
} from "@/lib/curriculum/select-next-concepts";
import type { DateString } from "@/lib/date";
import { collectMarketNews } from "@/lib/openai/collect-news";
import { generateDailyBriefing } from "@/lib/openai/generate-briefing";
import { getModel } from "@/lib/openai/client";
import { PROMPT_VERSION } from "@/lib/openai/prompts";
import {
  getBriefingByDate,
  getPreviousBriefings,
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
    const previousBriefings = await getPreviousBriefings();
    const learned = collectLearnedSlugs(previousBriefings);

    // 커리큘럼을 모두 학습했으면 처음으로 돌아가 복습한다. 개념 없이 발행하지 않는다.
    const concepts = selectNextConcepts(learned);
    const todayConcepts = concepts.length > 0 ? concepts : [CURRICULUM[0]];

    const learnedTitles = previousBriefings
      .flatMap((b) => b.knowledgeItems.map((item) => item.title))
      .slice(0, 40);

    const news = await collectMarketNews(date);

    const generated = await generateDailyBriefing({
      date,
      concepts: todayConcepts,
      candidates: news.candidates,
      learnedTitles,
    });

    const briefing = await saveBriefing({
      date,
      content: generated.content,
      model: getModel(),
      promptVersion: PROMPT_VERSION,
    });

    await finishGenerationLog(logId, {
      status: "success",
      inputTokens: news.inputTokens + generated.inputTokens,
      outputTokens: news.outputTokens + generated.outputTokens,
      webSearchCalls: news.webSearchCalls,
    });

    return { briefing, reused: false };
  } catch (error) {
    // 생성에 실패해도 기존 브리핑은 절대 지우지 않는다.
    await finishGenerationLog(logId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
