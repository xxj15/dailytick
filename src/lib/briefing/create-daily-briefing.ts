import "server-only";
import { TECH_CONCEPTS_PER_DAY, TECH_SOURCE_MAX_AGE_HOURS } from "@/config/app";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import {
  collectLearnedTitles,
  selectTodayConcepts,
} from "@/lib/curriculum/select-next-concepts";
import type { DateString } from "@/lib/date";
import { collectMarketNews, collectTechNews, NewsCollectionError } from "@/lib/openai/collect-news";
import { groundMarketNews, GroundNewsError } from "@/lib/openai/ground-news";
import {
  BriefingValidationError,
  generateDailyBriefing,
  generateTechSection,
} from "@/lib/openai/generate-briefing";
import { getModel } from "@/lib/openai/client";
import { composeHeadline } from "@/lib/openai/compose-headline";
import { PROMPT_VERSION } from "@/lib/openai/prompts";
import {
  getBriefingByDate,
  getConceptHistory,
  getTechConceptHistory,
  saveBriefing,
} from "@/lib/supabase/briefings";
import {
  finishGenerationLog,
  startGenerationLog,
} from "@/lib/supabase/generation-logs";
import type { Briefing, GroundedSection, TechSection } from "@/types/briefing";
import { auditEvidence, type GenerationAudit, type TechAudit } from "@/lib/news/generation-audit";
import type { NewsCandidate, BriefingViolation } from "@/types/briefing";

const defaultServices = {
  getBriefingByDate, getConceptHistory, getTechConceptHistory, collectMarketNews, collectTechNews,
  groundMarketNews: (candidates: NewsCandidate[], date: DateString, signal?: AbortSignal, maxAgeHours?: number) => groundMarketNews(candidates, date, undefined, signal, maxAgeHours),
  generateDailyBriefing: (params: Parameters<typeof generateDailyBriefing>[0]) => generateDailyBriefing(params),
  generateTechSection: (params: Parameters<typeof generateTechSection>[0]) => generateTechSection(params),
  composeHeadline,
  saveBriefing, getModel, startGenerationLog, finishGenerationLog,
};
export type BriefingServices = typeof defaultServices;

export type CreateBriefingResult = {
  briefing: Briefing;
  /** 이미 있던 브리핑을 그대로 반환했는가. */
  reused: boolean;
  /** 새로 생성했을 때만 있다. 생성 로그에 남긴 것과 같은 기록이다. */
  audit?: GenerationAudit;
};

type Usage = { inputTokens: number; outputTokens: number; webSearchCalls: number };

/**
 * 하루치 브리핑 생성 전체 흐름. (명세 §45)
 *
 *   과거 브리핑 조회 → 개념 선정 → 뉴스 수집 → 브리핑 생성 → 저장
 *
 * 경제 파트와 IT 파트는 같은 흐름을 동시에 탄다. 하나의 실행 기한 안에 둘 다 끝내야 한다.
 * 경제 파트가 지면의 본체다. IT 파트가 실패하면 IT 없이 발행하고, 경제 파트가 실패하면 발행하지 않는다.
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
  const audit: GenerationAudit = emptyAudit();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  let attempts = 0;
  let violations: BriefingViolation[] = [];

  // 경제 파트가 실패하면 IT 파트도 멈춘다. 발행하지 않을 지면에 비용을 쓰지 않는다.
  const techStop = new AbortController();
  const techRun = createTechSection(date, services, AbortSignal.any([signal, techStop.signal]));
  const settleTech = async () => {
    const tech = await techRun;
    usage.inputTokens += tech.usage.inputTokens;
    usage.outputTokens += tech.usage.outputTokens;
    usage.webSearchCalls += tech.usage.webSearchCalls;
    audit.tech = tech.audit;
    return tech.section;
  };

  try {
    const history = await services.getConceptHistory();

    // 커리큘럼을 모두 돌았으면 가장 오래된 개념부터 복습한다. 개념 없이 발행하지 않는다.
    const { concepts, mode } = selectTodayConcepts(history);
    const learnedTitles = collectLearnedTitles(history);

    audit.stage = "search";
    const news = await services.collectMarketNews(date, signal);
    usage.inputTokens += news.inputTokens;
    usage.outputTokens += news.outputTokens;
    usage.webSearchCalls += news.webSearchCalls;
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

    let content = markReview(generated.content, mode);
    const tech = await settleTech();

    // Tech가 앞에 오는 지면이므로 키워드·한 줄도 두 파트를 함께 보고 다시 쓴다.
    // 실패해도 발행은 막지 않는다. 경제 본문이 쓴 키워드가 그대로 남는다.
    if (tech) {
      try {
        const composed = await services.composeHeadline({ date, economy: content, tech }, signal);
        usage.inputTokens += composed.inputTokens;
        usage.outputTokens += composed.outputTokens;
        content = { ...content, ...composed.headline };
      } catch (error) {
        audit.headlineError = error instanceof Error ? error.message : String(error);
        console.error(`[briefing] 키워드 합성 실패(${date})`, audit.headlineError);
      }
    }

    signal.throwIfAborted();
    audit.stage = "save";
    const briefing = await services.saveBriefing({
      date,
      content,
      tech,
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

    return { briefing, reused: false, audit };
  } catch (error) {
    if (!audit.tech) {
      techStop.abort();
      await settleTech();
    }
    violations = recordFailure(error, audit, usage, violations);
    if (error instanceof BriefingValidationError) attempts = violations[violations.length - 1]?.attempt ?? 0;

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

/**
 * IT 파트. 경제 파트와 같은 단계를 밟되 실패를 던지지 않는다.
 * 무엇이 왜 실패했는지는 audit에 담아 경제 파트의 생성 로그에 함께 남긴다.
 */
async function createTechSection(
  date: DateString,
  services: BriefingServices,
  signal: AbortSignal,
): Promise<{ section: TechSection | null; audit: TechAudit; usage: Usage }> {
  const audit: TechAudit = { ...emptyAudit(), attempts: 0, violations: [] };
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };

  try {
    const history = await services.getTechConceptHistory();
    const { concepts, mode } = selectTodayConcepts(history, TECH_CURRICULUM, TECH_CONCEPTS_PER_DAY);
    const learnedTitles = collectLearnedTitles(history);

    audit.stage = "search";
    const news = await services.collectTechNews(date, signal);
    usage.inputTokens += news.inputTokens;
    usage.outputTokens += news.outputTokens;
    usage.webSearchCalls += news.webSearchCalls;
    audit.searchTrace = news.searchTrace;
    audit.rejectedUrls = news.rejectedUrls;
    audit.stage = "sources";
    const grounded = await services.groundMarketNews(news.candidates, date, signal, TECH_SOURCE_MAX_AGE_HOURS);
    usage.inputTokens += grounded.inputTokens;
    usage.outputTokens += grounded.outputTokens;
    audit.sourceRejections = grounded.rejected;
    audit.evidence = auditEvidence(grounded.candidates);
    if (!grounded.candidates.length) throw new Error("실제 본문으로 확인한 최신 IT 뉴스가 없습니다.");

    audit.stage = "generation";
    const generated = await services.generateTechSection({
      date, concepts, mode, candidates: grounded.candidates, learnedTitles, signal,
      maxSourceAgeHours: TECH_SOURCE_MAX_AGE_HOURS,
    });
    usage.inputTokens += generated.inputTokens;
    usage.outputTokens += generated.outputTokens;
    audit.attempts = generated.attempts;
    audit.violations = generated.violations;
    audit.reviews = generated.reviews;

    audit.stage = "complete";
    return { section: markReview(generated.content, mode), audit, usage };
  } catch (error) {
    audit.violations = recordFailure(error, audit, usage, audit.violations);
    if (error instanceof BriefingValidationError) audit.attempts = audit.violations[audit.violations.length - 1]?.attempt ?? 0;
    audit.errorMessage = error instanceof Error ? error.message : String(error);
    // 경제 파트는 발행되므로 응답만으로는 실패가 드러나지 않는다. 서버 로그에도 남긴다.
    console.error(`[briefing] IT 파트 생성 실패(${date}, ${audit.stage})`, audit.errorMessage, audit.violations);
    return { section: null, audit, usage };
  }
}

function emptyAudit(): GenerationAudit {
  return { stage: "history", searchTrace: [], rejectedUrls: [], sourceRejections: [], evidence: [], reviews: [] };
}

/** 복습일이면 화면에도 남긴다. AI 응답이 아니라 코드가 판단한 값이다. */
function markReview<T extends GroundedSection>(content: T, mode: "new" | "review"): T {
  if (mode !== "review") return content;
  return { ...content, knowledgeItems: content.knowledgeItems.map((item) => ({ ...item, review: true })) };
}

/** 실패 단계가 들고 나온 사용량·검색 기록·위반 내역을 로그 쪽으로 옮긴다. 갱신된 위반 목록을 돌려준다. */
function recordFailure(
  error: unknown,
  audit: GenerationAudit,
  usage: Usage,
  violations: BriefingViolation[],
): BriefingViolation[] {
  if (error instanceof NewsCollectionError) {
    usage.inputTokens += error.usage.inputTokens;
    usage.outputTokens += error.usage.outputTokens;
    usage.webSearchCalls += error.usage.webSearchCalls;
    audit.searchTrace = error.trace;
    audit.rejectedUrls = error.rejectedUrls;
  }
  if (error instanceof GroundNewsError) audit.sourceRejections = error.rejected;
  if (error instanceof BriefingValidationError) {
    usage.inputTokens += error.usage.inputTokens;
    usage.outputTokens += error.usage.outputTokens;
    audit.reviews = error.reviews;
    return error.violations;
  }
  return violations;
}
