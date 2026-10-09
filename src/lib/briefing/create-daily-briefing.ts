import "server-only";
import {
  collectLearnedTitles,
  selectTodayConcepts,
} from "@/lib/curriculum/select-next-concepts";
import type { DateString } from "@/lib/date";
import { collectMarketNews, NewsCollectionError } from "@/lib/openai/collect-news";
import { groundMarketNews, GroundNewsError } from "@/lib/openai/ground-news";
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
import { auditEvidence, type GenerationAudit } from "@/lib/news/generation-audit";
import type { NewsCandidate, BriefingViolation } from "@/types/briefing";

const defaultServices = {
  getBriefingByDate, getConceptHistory, collectMarketNews,
  groundMarketNews: (candidates: NewsCandidate[], date: DateString, signal?: AbortSignal) => groundMarketNews(candidates, date, undefined, signal),
  generateDailyBriefing: (params: Parameters<typeof generateDailyBriefing>[0]) => generateDailyBriefing(params),
  saveBriefing, getModel, startGenerationLog, finishGenerationLog,
};
export type BriefingServices = typeof defaultServices;

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
  options: { force?: boolean; signal?: AbortSignal } = {},
  overrides: Partial<BriefingServices> = {},
): Promise<CreateBriefingResult> {
  const services = { ...defaultServices, ...overrides };
  // 같은 날짜로 두 번 실행돼도 브리핑은 하나다.
  if (!options.force) {
    const existing = await services.getBriefingByDate(date);
    if (existing) return { briefing: existing, reused: true };
  }

  const logId = await services.startGenerationLog(date);
  // Vercel 실행 제한 전에 정리할 시간을 남긴다. 뉴스 수집·AI 호출이 같은 기한을 쓴다.
  const timeout = AbortSignal.timeout(260_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const audit: GenerationAudit = { stage: "history", searchTrace: [], rejectedUrls: [], sourceRejections: [], evidence: [], reviews: [] };
  const usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  let attempts = 0;
  let violations: BriefingViolation[] = [];

  try {
    const history = await services.getConceptHistory();

    // 커리큘럼을 모두 돌았으면 가장 오래된 개념부터 복습한다. 개념 없이 발행하지 않는다.
    const { concepts, mode } = selectTodayConcepts(history);
    const learnedTitles = collectLearnedTitles(history);

    audit.stage = "search";
    const news = await services.collectMarketNews(date, signal);
    usage.inputTokens += news.inputTokens;
    usage.outputTokens += news.outputTokens;
    usage.webSearchCalls = news.webSearchCalls;
    audit.searchTrace = news.searchTrace;
    audit.rejectedUrls = news.rejectedUrls;
    audit.stage = "sources";
    const grounded = await services.groundMarketNews(news.candidates, date, signal);
    usage.inputTokens += grounded.inputTokens;
    usage.outputTokens += grounded.outputTokens;
    audit.sourceRejections = grounded.rejected;
    audit.evidence = auditEvidence(grounded.candidates);
    if (!grounded.candidates.length) throw new Error("실제 본문으로 확인한 최신 뉴스가 없습니다.");

    audit.stage = "generation";
    const generated = await services.generateDailyBriefing({
      date,
      concepts,
      mode,
      candidates: grounded.candidates,
      learnedTitles,
      signal,
    });
    usage.inputTokens += generated.inputTokens;
    usage.outputTokens += generated.outputTokens;
    attempts = generated.attempts;
    violations = generated.violations;
    audit.reviews = generated.reviews;

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

    signal.throwIfAborted();
    audit.stage = "save";
    const briefing = await services.saveBriefing({
      date,
      content,
      model: services.getModel(),
      promptVersion: PROMPT_VERSION,
    });

    audit.stage = "complete";
    await services.finishGenerationLog(logId, {
      status: "success",
      ...usage,
      attempts,
      // 재시도로 통과했다면 1차에 무엇이 걸렸는지 여기에만 남는다.
      violations,
      audit,
    });

    return { briefing, reused: false };
  } catch (error) {
    if (error instanceof NewsCollectionError) {
      Object.assign(usage, error.usage);
      audit.searchTrace = error.trace;
      audit.rejectedUrls = error.rejectedUrls;
    }
    if (error instanceof GroundNewsError) audit.sourceRejections = error.rejected;
    if (error instanceof BriefingValidationError) {
      violations = error.violations;
      usage.inputTokens += error.usage.inputTokens;
      usage.outputTokens += error.usage.outputTokens;
      audit.reviews = error.reviews;
      attempts = violations[violations.length - 1]?.attempt ?? 0;
    }

    // 생성에 실패해도 기존 브리핑은 절대 지우지 않는다.
    await services.finishGenerationLog(logId, {
      status: "failed",
      ...usage,
      attempts,
      violations,
      audit,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
