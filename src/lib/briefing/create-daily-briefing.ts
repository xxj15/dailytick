import "server-only";
import { createHash } from "node:crypto";
import { ECONOMY_CONCEPTS_PER_DAY, NEWS_SLOTS, TECH_CONCEPTS_PER_DAY, TECH_DISCOVERY_MAX_AGE_DAYS } from "@/config/app";
import { CURRICULUM, type Concept } from "@/data/curriculum";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import {
  ECONOMY_GROUP,
  economyCandidates,
  fallbackConcept,
  recentKnowledge,
  techCandidates,
  type KnowledgeCandidate,
} from "@/lib/curation/candidates";
import {
  collectLearnedTitles,
  selectTodayConcepts,
} from "@/lib/curriculum/select-next-concepts";
import type { DateString } from "@/lib/date";
import { collectMarketNews, discoverTechTopics, NewsCollectionError, type CollectNewsResult, type TechTopic } from "@/lib/openai/collect-news";
import { curateKnowledge, type CuratorPick } from "@/lib/openai/curate";
import { boundForGrounding, groundMarketNews, GroundNewsError, unseenCandidates } from "@/lib/openai/ground-news";
import {
  BriefingValidationError,
  generateDailyBriefing,
  generateTechSection,
} from "@/lib/openai/generate-briefing";
import { getModel, timeoutForItems } from "@/lib/openai/client";
import { PROMPT_VERSION } from "@/lib/openai/prompts";
import {
  getBriefingByDate,
  getConceptHistory,
  getRecentNews,
  getTechConceptHistory,
  saveBriefing,
} from "@/lib/supabase/briefings";
import {
  finishGenerationLog,
  startGenerationLog,
} from "@/lib/supabase/generation-logs";
import type { Briefing, ConceptHistoryEntry, GroundedSection, NewsCandidate, NewsCoverage, NewsSlot, RecentNewsEntry, TechSection } from "@/types/briefing";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import { auditEvidence, type CoverageAudit, type CurationAudit, type GenerationAudit, type SlotCollectAudit, type TechAudit } from "@/lib/news/generation-audit";
import { sourceMatchKey } from "@/lib/news/search-provenance";
import { emptySlots, fitsSlot, matchSlots } from "@/lib/news/slots";
import type { BriefingViolation } from "@/types/briefing";

const defaultServices = {
  getBriefingByDate, getConceptHistory, getTechConceptHistory, getRecentNews,
  collectMarketNews, discoverTechTopics, curateKnowledge,
  groundMarketNews: (candidates: NewsCandidate[], date: DateString, signal?: AbortSignal, maxAgeHours?: number, allowUndated?: boolean, idPrefix?: string, koreanOnly?: boolean) =>
    groundMarketNews(candidates, date, undefined, signal, maxAgeHours, allowUndated, idPrefix, koreanOnly),
  generateDailyBriefing: (params: Parameters<typeof generateDailyBriefing>[0]) => generateDailyBriefing(params),
  generateTechSection: (params: Parameters<typeof generateTechSection>[0]) => generateTechSection(params),
  saveBriefing, getModel, startGenerationLog, finishGenerationLog,
};
export type BriefingServices = typeof defaultServices;

export type CreateBriefingResult = {
  briefing: Briefing;
  /** 이미 있던 브리핑을 그대로 반환했는가. */
  reused: boolean;
  /** 새로 생성했을 때만 있다. 생성 로그에 남긴 것과 같은 기록이다. */
  audit?: GenerationAudit;
  /** 저장하지 않은 미리보기 생성인가. */
  dryRun?: boolean;
};

type Usage = { inputTokens: number; outputTokens: number; webSearchCalls: number };

/** 실행 기한. Vercel 실행 제한(300초) 전에 정리할 시간을 남긴다. */
const DEADLINE_MS = 260_000;
/**
 * 재수집이 끝난 뒤 경제 상식 큐레이션(최대 45초)·작성(60초)·검토(60초)와 흔한 재작성 한 번에 남겨 두는 시간.
 * 재수집은 이 몫을 넘보지 못한다. 재수집은 덤이라, 시간이 모자라면 재수집을 끊고 1차 결과로 발행한다.
 */
const RECOLLECT_RESERVE_MS = 110_000;
/** 주요 이슈를 한 번 더 수집하려면 이만큼은 남아 있어야 한다. (작성 몫 + 재수집 예산 최소 60초) */
const RECOLLECT_MIN_LEFT_MS = RECOLLECT_RESERVE_MS + 60_000;
/** 재수집 후보의 본문 근거 확인을 시작하려면 재수집 예산이 이만큼은 남아 있어야 한다. (본문 수집 + 근거 문장 선택) */
const RECOLLECT_GROUND_MIN_MS = 30_000;
/** 재수집 후보의 id 접두어. 1차 후보(c1, c2…)와 근거 문장 id(c1-f1…)가 겹치지 않게 한다. */
const RECOLLECT_ID_PREFIX = "r";
/**
 * 1차 수집의 세 슬롯이 모두 실패했을 때, 시간 초과로 끝난 슬롯을 한 번 더 시도하는 하한.
 * 재수집보다 낮다. 1차 수집이 아무것도 못 남겼기 때문이다.
 * 슬롯 호출 제한 시간이 120초(NEWS_SLOT_COLLECT_TIMEOUT_MS)라, 셋 다 제한 시간까지 걸린 뒤에는 남은 시간이 이보다 적어 다시 시도하지 않는다.
 * 시간 초과 오류가 일찍 돌아온 경우에만 돈다.
 */
const RETRY_AFTER_TIMEOUT_MIN_LEFT_MS = 150_000;
/** 테크 상식이 끝난 뒤 경제 파트 저장과 생성 로그 기록에 남겨 두는 시간. */
const TECH_SAVE_RESERVE_MS = 20_000;
/**
 * 테크 상식 자체 기한. 실행 기한보다 먼저 끝나 경제 파트 저장 몫을 남긴다.
 * 경제 파트는 테크를 기다린 뒤 저장하므로, 테크가 늦으면 이 시점에 테크만 끊고 경제는 저장한다.
 */
const TECH_DEADLINE_MS = DEADLINE_MS - TECH_SAVE_RESERVE_MS;

/**
 * 하루치 브리핑 생성 전체 흐름.
 *
 *   경제·주요 이슈: 최근 뉴스 조회 → 슬롯별 후보 수집(슬롯마다 병렬 호출) → 본문 근거 확인(빈 슬롯이 있으면 그 슬롯만 1회 재수집) → 경제 상식 큐레이션 → 작성·검토
 *   테크 상식:     학습 이력 → 그날 기술 글 발굴 → 큐레이션(서로 다른 개념 최대 TECH_CONCEPTS_PER_DAY개) → (아티클·트렌드면) 원문 근거 확인 → 작성·검토
 *
 * 두 흐름은 동시에 돈다. 경제·주요 이슈가 지면의 본체라 실패하면 발행하지 않는다.
 * 테크 상식의 빈 자리는 검증된 커리큘럼 개념(커리큘럼을 다 돌았으면 복습 개념)으로 채운다.
 * 함께 쓴 항목이 작성·검토를 통과하지 못하면 한 항목으로 줄여 다시 쓴다.
 * 그래도 통과하지 못하거나, 자기 기한(TECH_DEADLINE_MS)을 넘기거나, 커리큘럼이 비어 고를 것이 없으면 그날만 테크 상식을 빼고 발행한다.
 *
 * dryRun이면 같은 흐름을 돌리되 DB에 아무것도 쓰지 않고 결과만 돌려준다. 발행 전 검증용이다.
 */
export async function createDailyBriefing(
  date: DateString,
  options: { force?: boolean; signal?: AbortSignal; dryRun?: boolean } = {},
  overrides: Partial<BriefingServices> = {},
): Promise<CreateBriefingResult> {
  const services = { ...defaultServices, ...overrides };
  const dryRun = options.dryRun === true;
  // 같은 날짜로 두 번 실행돼도 브리핑은 하나다.
  if (!options.force && !dryRun) {
    const existing = await services.getBriefingByDate(date);
    if (existing) return { briefing: existing, reused: true };
  }

  const logId = dryRun ? null : await services.startGenerationLog(date);
  const startedAt = Date.now();
  const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt);
  const timeout = AbortSignal.timeout(DEADLINE_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const audit: GenerationAudit = emptyAudit();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  const addUsage = (part: Partial<Usage>) => {
    usage.inputTokens += part.inputTokens ?? 0;
    usage.outputTokens += part.outputTokens ?? 0;
    usage.webSearchCalls += part.webSearchCalls ?? 0;
  };
  let attempts = 0;
  let violations: BriefingViolation[] = [];

  // 경제·주요 이슈가 실패하면 테크 상식도 멈춘다. 발행하지 않을 지면에 비용을 쓰지 않는다.
  const techStop = new AbortController();
  // 테크 상식은 자기 기한(TECH_DEADLINE_MS)에 끊긴다. 끊기면 테크만 빠지고 경제 파트는 남은 시간에 저장한다.
  const techBudget = new AbortController();
  const techTimer = setTimeout(
    () => techBudget.abort(new DOMException(`테크 상식 시간 예산(${Math.round(TECH_DEADLINE_MS / 1000)}초)을 넘겨 중단했습니다.`, "TimeoutError")),
    TECH_DEADLINE_MS,
  );
  const techLeft = () => TECH_DEADLINE_MS - (Date.now() - startedAt);
  const techRun = createTechSection(date, services, AbortSignal.any([signal, techStop.signal, techBudget.signal]), techLeft)
    .finally(() => clearTimeout(techTimer));
  const settleTech = async () => {
    const tech = await techRun;
    addUsage(tech.usage);
    audit.tech = tech.audit;
    return tech.section;
  };

  try {
    const history = await services.getConceptHistory();
    // 최근 뉴스를 못 읽어도 발행은 한다. 반복 방지는 검토 단계가 한 번 더 본다.
    const recentNews: RecentNewsEntry[] = await services.getRecentNews(date).catch(() => []);

    audit.stage = "search";
    // 슬롯마다 따로 수집하는 호출 세 개를 동시에 돌려 합친다. 일부가 실패해도 나머지로 진행한다.
    const news = await collectFirstPass(date, recentNews, services, signal, timeLeft);
    addUsage(news);
    audit.searchTrace = news.searchTrace;
    audit.rejectedUrls = news.rejectedUrls;
    audit.stage = "sources";
    let candidates = news.candidates;
    let grounded = await services.groundMarketNews(candidates, date, signal);
    addUsage(grounded);

    // 근거가 확인된 후보로 채울 수 없는 슬롯이 있으면, 시간이 될 때 그 슬롯의 섹션을 겨냥해 한 번 더 수집한다.
    // (후보가 모자란 건 모델이 검색에 없던 URL을 내서 걸러진 경우가 많다)
    // 재수집은 덤이다. 1차에서 확인한 근거는 다시 읽지도 덮어쓰지도 않고, 재수집이 실패하거나 시간 예산을 넘겨도 1차 결과로 발행한다.
    const coverage = news.coverage;
    const emptyBefore = emptySlots(grounded.candidates);
    let recollected = false;
    let recollectError: string | undefined;
    if (emptyBefore.length && timeLeft() > RECOLLECT_MIN_LEFT_MS) {
      recollected = true;
      const fitsEmpty = (candidate: NewsCandidate) => emptyBefore.some((slot) => fitsSlot(slot, candidate));
      // 1차에서 실제로 본문을 읽은 후보. 근거 확인 한도에 잘려 읽지 않은 후보는 시도한 것으로 치지 않는다.
      const tried = new Set(boundForGrounding(candidates));
      // 읽지 않은 1차 후보 가운데 빈 슬롯에 맞는 것은 이번에 함께 읽는다.
      const unread = candidates.filter((candidate) => !tried.has(candidate) && fitsEmpty(candidate));

      // 재수집 전용 기한. 실행 기한(signal)에 더해, 작성·검토 몫(RECOLLECT_RESERVE_MS)이 남는 시점에 끊는다.
      const recollectLeft = () => timeLeft() - RECOLLECT_RESERVE_MS;
      const budgetMs = recollectLeft();
      const budgetError = `재수집 시간 예산(${Math.round(budgetMs / 1000)}초)을 넘겨 중단했습니다.`;
      const budget = new AbortController();
      const budgetTimer = setTimeout(
        () => budget.abort(new DOMException("재수집 시간 예산을 넘겼습니다.", "TimeoutError")),
        budgetMs,
      );
      const recollectSignal = AbortSignal.any([signal, budget.signal]);
      try {
        const more = await services.collectMarketNews(date, recollectSignal, {
          recentNews,
          focusSlots: emptyBefore,
          // 같은 후보·같은 실패 URL을 다시 내서 수집 시간을 버리지 않게 한다.
          previousTitles: candidates.map((candidate) => candidate.title),
          rejectedUrls: [...new Set([...audit.rejectedUrls, ...grounded.rejected.flatMap((entry) => (entry.url ? [entry.url] : []))])],
        });
        addUsage(more);
        audit.searchTrace = [...audit.searchTrace, ...more.searchTrace];
        audit.rejectedUrls = [...audit.rejectedUrls, ...more.rejectedUrls];
        mergeCoverage(coverage, more.coverage);
        // 1차에서 읽었거나 지금 읽을 후보와 겹치는 출처는 빼고 새 후보로 받는다.
        const fresh = unseenCandidates(more.candidates, [...tried, ...unread]);
        // 수집 기록에는 1차 후보와 제목이 같은 후보를 다시 세지 않는다.
        const firstTitles = new Set(candidates.map((candidate) => candidate.title.trim()));
        candidates = [...candidates, ...fresh.filter((candidate) => !firstTitles.has(candidate.title.trim()))];
        // 본문을 읽는 것은 빈 슬롯에 맞는 후보뿐이다. 이미 채울 수 있는 슬롯의 후보까지 읽어 시간을 쓰지 않는다.
        const targets = [...unread, ...fresh.filter(fitsEmpty)];
        if (targets.length) {
          if (recollectLeft() < RECOLLECT_GROUND_MIN_MS) {
            throw new Error(`재수집 후보 ${targets.length}건의 본문을 확인할 시간이 남지 않아 건너뛰었습니다.`);
          }
          const added = await services.groundMarketNews(targets, date, recollectSignal, undefined, undefined, RECOLLECT_ID_PREFIX);
          addUsage(added);
          grounded = { ...grounded, candidates: [...grounded.candidates, ...added.candidates], rejected: [...grounded.rejected, ...added.rejected] };
          // 본문을 하나도 읽기 전에 예산이 끝나면 근거 확인은 던지지 않고 빈 결과를 돌려준다. 끊긴 사실을 따로 남긴다.
          if (budget.signal.aborted) recollectError = budgetError;
        }
      } catch (error) {
        // 실행 기한·취소는 재수집 실패가 아니다. 이어서 할 수 있는 일이 없으므로 그대로 멈춘다.
        // 재수집 자기 기한으로 끊긴 것은 재수집 실패다. 1차 결과로 이어 간다.
        if (signal.aborted) throw error;
        recollectError = budget.signal.aborted ? budgetError : error instanceof Error ? error.message : String(error);
        if (error instanceof NewsCollectionError) {
          addUsage(error.usage);
          audit.searchTrace = [...audit.searchTrace, ...error.trace];
          audit.rejectedUrls = [...audit.rejectedUrls, ...error.rejectedUrls];
        }
        if (error instanceof GroundNewsError) grounded = { ...grounded, rejected: [...grounded.rejected, ...error.rejected] };
      } finally {
        clearTimeout(budgetTimer);
      }
    }
    const searchedAfter = coverage.filter((entry) => entry.searched).length;
    const emptyAfter = emptySlots(grounded.candidates);
    const collectable = matchSlots(candidates);
    const coverageAudit: CoverageAudit = {
      sections: coverage,
      // 수집한 후보로는 채울 수 있었는데 본문 확인에서 떨어졌다면 출처 문제, 후보 자체가 없었다면 검색 범위나 그날 사정이다.
      verdict: emptyAfter.length === 0 ? "ok"
        : emptyAfter.some((slot) => collectable[slot]) ? "sources_failed"
        : searchedAfter < 4 ? "narrow_search"
        : "thin_day",
      recollected,
      recollectedSlots: recollected ? emptyBefore : [],
      ...(recollectError ? { recollectError } : {}),
      firstPass: news.slots,
      candidates: candidates.length,
      grounded: grounded.candidates.length,
      slots: NEWS_SLOTS.map((slot) => ({
        slot,
        candidates: candidates.filter((candidate) => fitsSlot(slot, candidate)).length,
        grounded: grounded.candidates.filter((candidate) => fitsSlot(slot, candidate)).length,
      })),
    };
    audit.coverage = coverageAudit;
    audit.sourceRejections = grounded.rejected;
    audit.evidence = auditEvidence(grounded.candidates);
    if (!grounded.candidates.length) throw new Error("실제 본문으로 확인한 최신 뉴스가 없습니다.");

    // 경제 상식: 뉴스와 별개로 고르되, 오늘 이슈와 자연스럽게 이어지면 가산점을 준다.
    const economy = await chooseKnowledge("economy", {
      history,
      candidates: economyCandidates(history),
      curriculum: CURRICULUM,
      newsTitles: grounded.candidates.map((candidate) => candidate.title),
      date, services, signal,
    }, ECONOMY_CONCEPTS_PER_DAY);
    addUsage(economy.usage);
    audit.curation = economy.audit;
    if (!economy.choices.length) throw new Error(`경제 상식을 고르지 못했습니다: ${economy.audit.error ?? "검증된 후보 없음"}`);

    audit.stage = "generation";
    const generated = await services.generateDailyBriefing({
      date,
      concepts: economy.choices.map((choice) => choice.concept),
      mode: sectionMode(economy.choices),
      candidates: grounded.candidates,
      learnedTitles: collectLearnedTitles(history),
      recentNews,
      signal,
    });
    addUsage(generated);
    attempts = generated.attempts;
    violations = generated.violations;
    audit.reviews = generated.reviews;

    // 슬롯별 발행 결과. 다른 분야 기사로 대신 채우지 않으므로 빈 슬롯은 빈 채로 남는다. 마지막 시도에서 빠진 슬롯도 여기서 empty다.
    coverageAudit.slots = coverageAudit.slots.map((entry) => {
      const published = generated.content.newsItems.find((item) => item.slot === entry.slot);
      if (published) return { ...entry, status: "filled", rank: published.rank };
      return { ...entry, status: "empty", reason: emptyAfter.includes(entry.slot) ? "근거가 확인된 후보로 채울 수 없었다" : "작성·검토 단계에서 빠졌다" };
    });

    const content = markReview(generated.content, economy.choices);
    const tech = await settleTech();

    signal.throwIfAborted();
    const model = services.getModel();
    let briefing: Briefing;
    if (dryRun) {
      briefing = { ...content, tech, id: "dry-run", briefingDate: date, generatedAt: new Date().toISOString(), model, promptVersion: PROMPT_VERSION };
    } else {
      audit.stage = "save";
      briefing = await services.saveBriefing({ date, content, tech, model, promptVersion: PROMPT_VERSION });
    }

    audit.stage = "complete";
    await services.finishGenerationLog(logId, {
      status: "success",
      ...usage,
      attempts,
      // 재시도로 통과했다면 1차에 무엇이 걸렸는지 여기에만 남는다.
      violations,
      audit,
    });

    return { briefing, reused: false, audit, dryRun };
  } catch (caught) {
    if (!audit.tech) {
      techStop.abort();
      await settleTech();
    }
    // 경제 상식을 고르는 중에 끊겼다면 그때까지의 큐레이션 기록·사용량을 살리고, 테크 경로처럼 원래 중단 오류를 던진다.
    if (caught instanceof SelectionAbortedError) {
      addUsage(caught.usage);
      audit.curation = caught.audit;
    }
    const error = caught instanceof SelectionAbortedError ? caught.reason : caught;
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
    // cron 응답이 실패 원인을 보여줄 수 있도록 기록을 함께 들려 보낸다.
    if (error instanceof Error) Object.assign(error, { audit });
    throw error;
  }
}

/** 1차 수집 결과. 슬롯별 호출을 합친 것이다. 슬롯별 호출 결과(실패한 슬롯과 이유 포함)는 slots에 남는다. */
type FirstPassResult = CollectNewsResult & { coverage: NewsCoverage; slots: SlotCollectAudit[] };
type SlotOutcome = { slot: NewsSlot } & ({ ok: true; result: CollectNewsResult } | { ok: false; error: unknown });

/**
 * 1차 수집. 슬롯(top·domestic·it)마다 그 슬롯 후보만 찾는 호출을 동시에 돌리고 결과를 합친다.
 * 호출 하나가 세 슬롯을 다 훑느라 길어지면 늦게 도는 재수집에 기댈 수밖에 없다. 처음부터 슬롯마다 후보를 확보한다.
 *
 * 호출은 서로를 기다리지 않는다. 하나가 실패하면 나머지로 진행하고, 실패한 슬롯과 이유를 slots에 남긴다.
 * 셋 다 실패할 때만 수집 실패다. 그중 시간 초과로 끝난 슬롯은 시간이 남으면 한 번만 다시 시도한다.
 *
 * 합칠 때는 슬롯 전용 호출(국내·IT)을 먼저, 화제 호출을 나중에 합친다(mergeSlotCandidates).
 * 앞선 호출의 후보와 제목이 같거나 출처 URL이 하나라도 겹치면 같은 사건으로 보고 새 출처만 앞선 후보에 붙인다.
 * 사용량·검색 기록·거부 URL은 실패한 호출 것까지 모두 합치고, 섹션 기록(coverage)은 실제로 훑은 쪽을 남긴다.
 */
async function collectFirstPass(
  date: DateString,
  recentNews: RecentNewsEntry[],
  services: BriefingServices,
  signal: AbortSignal,
  timeLeft: () => number,
): Promise<FirstPassResult> {
  const outcomes: SlotOutcome[] = [];
  const collect = async (slots: readonly NewsSlot[]) => {
    const settled = await Promise.allSettled(slots.map((slot) => services.collectMarketNews(date, signal, { recentNews, slot })));
    // 실행 기한·취소는 슬롯 실패가 아니다. 이어서 할 수 있는 일이 없으므로 그대로 멈춘다.
    signal.throwIfAborted();
    settled.forEach((outcome, index) => outcomes.push(outcome.status === "fulfilled"
      ? { slot: slots[index], ok: true, result: outcome.value }
      : { slot: slots[index], ok: false, error: outcome.reason }));
  };
  await collect(NEWS_SLOTS);
  if (outcomes.every((outcome) => !outcome.ok)) {
    // 웹 검색을 여러 번 하는 단계라 가끔 기한을 넘긴다. 셋 다 실패했을 때만, 시간 초과로 끝난 슬롯을 한 번 더 시도한다.
    const timedOut = outcomes.flatMap((outcome) => (!outcome.ok && isTimeout(outcome.error) ? [outcome.slot] : []));
    if (timedOut.length && timeLeft() >= RETRY_AFTER_TIMEOUT_MIN_LEFT_MS) await collect(timedOut);
  }

  const merged: FirstPassResult = {
    candidates: [], coverage: [], searchTrace: [], rejectedUrls: [], slots: [],
    inputTokens: 0, outputTokens: 0, webSearchCalls: 0,
  };
  for (const slot of FIRST_PASS_MERGE_ORDER) {
    const tries = outcomes.filter((outcome) => outcome.slot === slot);
    for (const outcome of tries) {
      const spent = outcome.ok
        ? { usage: outcome.result, trace: outcome.result.searchTrace, rejectedUrls: outcome.result.rejectedUrls }
        : outcome.error instanceof NewsCollectionError
          ? { usage: outcome.error.usage, trace: outcome.error.trace, rejectedUrls: outcome.error.rejectedUrls }
          : null;
      if (spent) {
        merged.inputTokens += spent.usage.inputTokens;
        merged.outputTokens += spent.usage.outputTokens;
        merged.webSearchCalls += spent.usage.webSearchCalls;
        merged.searchTrace.push(...spent.trace);
        merged.rejectedUrls.push(...spent.rejectedUrls);
      }
      if (!outcome.ok) continue;
      merged.candidates = mergeSlotCandidates(merged.candidates, outcome.result.candidates);
      mergeCoverage(merged.coverage, outcome.result.coverage);
    }
    // 슬롯마다 마지막 시도가 결과다. 다시 시도하는 것은 실패한 슬롯뿐이라 성공은 언제나 마지막이다.
    const last = tries[tries.length - 1];
    merged.slots.push(last.ok ? { slot, candidates: last.result.candidates.length } : { slot, candidates: 0, error: errorMessage(last.error) });
  }
  // 기록은 지면 순서(top → domestic → it)로 남긴다.
  merged.slots.sort((a, b) => NEWS_SLOTS.indexOf(a.slot) - NEWS_SLOTS.indexOf(b.slot));
  merged.rejectedUrls = [...new Set(merged.rejectedUrls)];

  const failures = merged.slots.filter((entry) => entry.error !== undefined);
  if (failures.length === NEWS_SLOTS.length) {
    throw new NewsCollectionError(
      `주요 이슈 후보 수집 실패(세 슬롯 모두): ${failures.map((failure) => `${failure.slot}: ${failure.error}`).join(" / ")}`,
      { inputTokens: merged.inputTokens, outputTokens: merged.outputTokens, webSearchCalls: merged.webSearchCalls },
      merged.searchTrace,
      merged.rejectedUrls,
    );
  }
  return merged;
}

/**
 * 1차 슬롯 호출을 합치는 순서. 슬롯 전용 호출(국내·IT)이 먼저다.
 * 화제 호출이 같은 사건을 국내·IT에 맞지 않는 분류로 냈어도 슬롯에 맞는 쪽이 후보로 남는다.
 */
const FIRST_PASS_MERGE_ORDER: readonly NewsSlot[] = ["domestic", "it", "top"];

/**
 * 한 슬롯 호출의 후보를 앞선 호출에서 합친 후보에 더한다.
 * 앞선 후보와 제목이 같거나 출처 URL이 하나라도 겹치면 같은 사건이다. 두 번째 후보로 남기지 않고,
 * 아직 어느 후보에도 없는 출처만 앞선 후보 뒤에 붙인다. 한 사건이 두 후보로 갈라지지도, 새 출처를 버리지도 않는다.
 * 같은 호출 안의 후보끼리는 비교하지 않는다. 호출 하나의 결과는 지금까지처럼 그대로 받는다.
 * (재수집은 1차 결과를 다시 읽지 않으려고 unseenCandidates로 겹친 출처를 빼는 규칙을 그대로 쓴다)
 */
function mergeSlotCandidates(merged: NewsCandidate[], incoming: NewsCandidate[]): NewsCandidate[] {
  const keyOf = (url: string) => sourceMatchKey(url) ?? url;
  const result = [...merged];
  const earlier = merged.length;
  for (const candidate of incoming) {
    const title = candidate.title.trim();
    const keys = new Set(candidate.sources.map((source) => keyOf(source.url)));
    const index = result.slice(0, earlier).findIndex((kept) =>
      kept.title.trim() === title || kept.sources.some((source) => keys.has(keyOf(source.url))));
    if (index === -1) {
      result.push(candidate);
      continue;
    }
    const taken = new Set(result.flatMap((kept) => kept.sources.map((source) => keyOf(source.url))));
    const extra = candidate.sources.filter((source) => !taken.has(keyOf(source.url)));
    if (extra.length) result[index] = { ...result[index], sources: [...result[index].sources, ...extra] };
  }
  return result;
}

/** 섹션 기록을 합친다. 새 섹션은 더하고, 같은 섹션은 실제로 훑은(searched) 기록으로 바꾼다. */
function mergeCoverage(into: NewsCoverage, more: NewsCoverage | undefined) {
  for (const entry of more ?? []) {
    const index = into.findIndex((prev) => prev.section === entry.section);
    if (index === -1) into.push(entry);
    else if (entry.searched) into[index] = entry;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && /timed out|timeout/i.test(error.message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 고른 상식 하나. evidence는 아티클·검색 후보의 원문이고, 각 원문에는 이 개념의 slug(knowledgeSlug)가 붙어 있다.
 * 원문을 확인한 상식(아티클·발굴 글)만 evidence가 있다. 커리큘럼 개념은 비어 있다.
 */
type Choice = { concept: Concept; mode: "new" | "review"; evidence: GroundedCandidate[] };
type ChosenEntry = NonNullable<CurationAudit["chosen"]>[number];

/**
 * 상식을 고르는 중 실행·테크 기한으로 끊겼다. 후보 탈락이 아니다.
 * 원래 오류(reason)를 그대로 전하되, 그때까지의 큐레이션 기록과 사용량을 함께 들고 나간다.
 */
class SelectionAbortedError extends Error {
  constructor(
    readonly reason: unknown,
    readonly audit: CurationAudit,
    readonly usage: Usage,
  ) {
    super(errorMessage(reason));
    this.name = "SelectionAbortedError";
  }
}

/**
 * 같은 개념인지 가르는 열쇠. 첫 참고 URL을 정규화(sourceMatchKey)한 값이다. 참고 URL이 없으면 null.
 * 한쪽 이상이 원문을 확인하는 상식(아티클·발굴 글)일 때만 쓴다. 같은 글이 커리큘럼 개념과 아티클로 두 번 실리지 않게 한다.
 * 커리큘럼 개념끼리는 참고 문서를 공유해도 서로 다른 개념이라 slug로만 가른다.
 */
function referenceKey(url: string | undefined): string | null {
  return url ? (sourceMatchKey(url) ?? url) : null;
}

/**
 * 상식을 count개까지 고른다. 고른 상식은 서로 다른 개념이다(slug가 다르고, 아티클·발굴 글이면 첫 참고 URL도 다르다).
 *
 * 큐레이터가 추천한 순서대로 검증을 시도한다. 아티클·검색 후보는 원문 근거 확인을 통과해야만 쓴다.
 * 이미 고른 것과 같은 개념인 후보는 원문을 읽기 전에 거른다.
 * 여러 개를 고를 때는 가능하면 서로 다른 분야(category)로 고른다.
 * 이미 고른 분야의 추천은 검증하지 않고 미뤄 둔다. 다른 분야 추천을 다 본 뒤에도 자리가 남을 때만 추천 순서대로 검증해 쓴다.
 * 그래도 모자라면 사람이 검증한 커리큘럼 개념(이미 고른 것과 다른 개념, 가능하면 다른 분야)으로 채운다.
 * 대체할 미학습 개념도 없으면(커리큘럼을 다 돌았으면) 커리큘럼 복습 개념으로 빈 자리를 채운다.
 * 하나도 고르지 못하면 고르지 않는다(발행 보류). 미학습 후보가 하나도 없으면 커리큘럼 복습으로 넘어간다.
 * 고르는 중 실행·테크 기한으로 끊기면 후보 탈락으로 기록하지 않고 SelectionAbortedError로 던진다.
 *
 * 돌려주는 순서가 지면 순서다. 추천에서 고른 것은 추천 순서, 대체로 채운 것은 그 뒤다.
 */
async function chooseKnowledge(
  kind: "tech" | "economy",
  params: {
    history: ConceptHistoryEntry[];
    candidates: KnowledgeCandidate[];
    curriculum: Concept[];
    newsTitles?: string[];
    topics?: TechTopic[];
    date: DateString;
    services: BriefingServices;
    signal: AbortSignal;
  },
  count: number,
): Promise<{ choices: Choice[]; audit: CurationAudit; usage: Usage }> {
  const { history, candidates, date, services, signal } = params;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  // 경제 상식은 후보를 다섯 갈래로 보여주므로 최근 이력도 같은 갈래 이름으로 맞춘다. 그래야 겹침 감점이 작동한다.
  const recent = recentKnowledge(history).map((entry) =>
    kind === "economy" ? { ...entry, category: ECONOMY_GROUP[entry.category ?? ""] ?? entry.category } : entry,
  );

  /** 고른 것. order는 추천 순위(대체로 채운 것은 추천 뒤)다. */
  const taken: { order: number; choice: Choice; entry: ChosenEntry }[] = [];
  const takenCategories = () => new Set(taken.map(({ entry }) => entry.category));
  /**
   * 이미 고른 것과 같은 개념인가. slug가 같으면 같은 개념이다.
   * 한쪽 이상이 원문을 확인하는 상식(sourced: 아티클·발굴 글)이면 첫 참고 URL(정규화)이 같아도 같은 개념이다.
   * 같은 글이 커리큘럼 개념과 아티클로, 또는 발굴 글 두 개로 같은 날 두 번 실리지 않게 한다.
   * 커리큘럼 개념끼리는 참고 문서가 같아도(도구 호출·구조화된 출력처럼) 다른 개념이므로 slug로만 비교한다.
   */
  const sameAs = (slug: string | undefined, url: string | undefined, sourced: boolean) => {
    const key = referenceKey(url);
    return taken.find(({ choice }) =>
      choice.concept.slug === slug ||
      ((sourced || choice.evidence.length > 0) && key !== null && referenceKey(choice.concept.references?.[0]?.url) === key));
  };
  /**
   * 빈 자리를 커리큘럼 개념으로 하나씩 채운다. selectTodayConcepts 순서(미학습 → 가장 오래전에 다룬 개념)를 따르고,
   * 이미 고른 것과 같은 개념은 뺀다. 커리큘럼을 다 돈 뒤라면 복습이고, 그 항목에만 복습 표시를 한다.
   */
  const fillFromCurriculum = (fallback: boolean) => {
    while (taken.length < count) {
      const open = params.curriculum.filter((concept) => !sameAs(concept.slug, concept.references?.[0]?.url, false));
      const { concepts: [concept], mode } = selectTodayConcepts(history, open, 1, false);
      if (!concept) break;
      const format = concept.format ?? "concept";
      taken.push({
        order: Number.MAX_SAFE_INTEGER,
        choice: { concept: { ...concept, format }, mode, evidence: [] },
        entry: {
          id: `k-${concept.slug}`, title: concept.title, format, category: concept.category,
          ...(fallback ? { fallback: true as const } : {}),
          ...(mode === "review" ? { review: true as const } : {}),
        },
      });
    }
  };

  if (!candidates.length) {
    fillFromCurriculum(false);
    if (!taken.length) return { choices: [], audit: { status: "skipped", error: "커리큘럼이 비어 있습니다." }, usage };
    return { choices: taken.map(({ choice }) => choice), audit: { status: "review", chosen: taken.map(({ entry }) => entry) }, usage };
  }

  const audit: CurationAudit = { status: "curated", rejected: [] };

  /** 아티클·발굴 후보의 원문 정보. 근거 확인에 넘기는 후보다. 커리큘럼 개념은 원문 확인 없이 쓴다. */
  const sourceOf = (candidate: KnowledgeCandidate) => candidate.article
    ? { title: candidate.article.title, summary: candidate.article.takeaway, region: "GLOBAL" as const, category: candidate.category === "ai" ? "ai" as const : "software" as const, importance: 8,
        sources: [{ publisher: candidate.article.publisher, title: candidate.article.title, url: candidate.article.url }] }
    : params.topics?.[Number(candidate.id.slice(2)) - 1]?.candidate;

  /**
   * 추천 하나를 검증한다. 쓸 수 없으면 사유를 남기고 null.
   * 실행·테크 기한으로 끊겼다면 후보 탓이 아니므로 사유를 남기지 않고 그대로 던진다.
   */
  const verify = async (pick: CuratorPick, candidate: KnowledgeCandidate): Promise<Choice | null> => {
    if (candidate.concept) return { concept: candidate.concept, mode: "new", evidence: [] };

    // 아티클·검색 후보: 서버가 원문을 읽어 근거 문장을 확인한 뒤에만 쓴다.
    const source = sourceOf(candidate);
    if (!source) {
      audit.rejected?.push(`${candidate.id}: 원문 정보 없음`);
      return null;
    }
    try {
      const grounded = await services.groundMarketNews(
        [source], date, signal,
        candidate.article ? undefined : TECH_DISCOVERY_MAX_AGE_DAYS * 24,
        Boolean(candidate.article),
        // 상식 여러 개의 원문을 한 번에 넘기므로 원문 id가 겹치지 않게 후보 id를 접두어로 쓴다.
        `${candidate.id}:`,
        // 테크 상식은 원문을 한국어로 풀어 쓴다. 공식 블로그·릴리스 노트 같은 영문 원문도 근거로 받는다.
        false,
      );
      usage.inputTokens += grounded.inputTokens;
      usage.outputTokens += grounded.outputTokens;
      // 본문을 읽는 중에 끊기면 근거 확인은 던지지 않고 빈 결과를 돌려준다. 그 결과를 후보 탈락으로 남기지 않는다.
      signal.throwIfAborted();
      const evidence = grounded.candidates[0];
      if (!evidence) {
        audit.rejected?.push(`${candidate.id}: ${grounded.rejected.map((entry) => entry.reason).join(" / ") || "원문 근거 확인 실패"}`);
        return null;
      }
      const url = evidence.documents[0]?.source.url ?? source.sources[0].url;
      const concept: Concept = {
        slug: candidate.article?.slug ?? `d-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`,
        title: pick.title.trim() || candidate.title,
        level: candidate.level,
        category: candidate.category,
        format: candidate.format,
        references: [{ title: `${evidence.documents[0]?.source.publisher ?? "원문"}: ${evidence.documents[0]?.source.title ?? candidate.title}`, url }],
      };
      // 작성·검토가 항목마다 자기 원문만 보도록 이 원문이 어느 상식의 근거인지 붙인다.
      return { concept, mode: "new", evidence: [{ ...evidence, knowledgeSlug: concept.slug }] };
    } catch (error) {
      if (signal.aborted) throw error;
      audit.rejected?.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const tryPick = async (order: number, pick: CuratorPick, candidate: KnowledgeCandidate) => {
    // 원문을 읽기 전에 후보 자체의 slug·URL로 먼저 본다. 이미 고른 것과 같은 개념이면 원문 확인 비용을 쓰지 않는다.
    const known = sameAs(
      candidate.concept?.slug ?? candidate.article?.slug,
      candidate.concept ? candidate.concept.references?.[0]?.url : sourceOf(candidate)?.sources[0]?.url,
      !candidate.concept,
    );
    if (known) {
      audit.rejected?.push(`${candidate.id}: 이미 고른 ${known.entry.id}와 같은 개념`);
      return;
    }
    const choice = await verify(pick, candidate);
    if (!choice) return;
    // 원문을 읽은 뒤의 실제 원문 URL로 한 번 더 본다. 리디렉션 등으로 후보 URL과 다를 수 있다.
    const same = sameAs(choice.concept.slug, choice.concept.references?.[0]?.url, choice.evidence.length > 0);
    if (same) {
      audit.rejected?.push(`${candidate.id}: 이미 고른 ${same.entry.id}와 같은 개념`);
      return;
    }
    taken.push({ order, choice, entry: { id: candidate.id, title: choice.concept.title, format: candidate.format, category: candidate.category, reason: pick.reason } });
  };

  try {
    let picks: CuratorPick[] = [];
    try {
      const curated = await services.curateKnowledge({
        kind, date, recent, newsTitles: params.newsTitles, count,
        candidates: candidates.map(({ id, format, category, level, title, note }) => ({ id, format, category, level, title, note })),
      }, signal);
      usage.inputTokens += curated.inputTokens;
      usage.outputTokens += curated.outputTokens;
      picks = curated.picks;
      audit.picks = picks;
    } catch (error) {
      if (signal.aborted) throw error;
      audit.error = `큐레이터 실패: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 1차: 추천 순서대로, 아직 고르지 않은 분야만 검증한다. 이미 고른 분야의 추천은 미룬다.
    const deferred: { order: number; pick: CuratorPick; candidate: KnowledgeCandidate }[] = [];
    const seen = new Set<string>();
    for (const [order, pick] of picks.entries()) {
      signal.throwIfAborted();
      if (taken.length >= count) break;
      const candidate = candidates.find((entry) => entry.id === pick.id);
      if (!candidate) {
        audit.rejected?.push(`${pick.id}: 후보 목록에 없는 id`);
        continue;
      }
      if (seen.has(candidate.id)) {
        audit.rejected?.push(`${pick.id}: 같은 후보를 두 번 추천`);
        continue;
      }
      seen.add(candidate.id);
      if (takenCategories().has(candidate.category)) {
        deferred.push({ order, pick, candidate });
        continue;
      }
      await tryPick(order, pick, candidate);
    }
    // 2차: 다른 분야로 자리를 채우지 못했다. 미뤄 둔 같은 분야 추천을 추천 순서대로 검증한다.
    for (const { order, pick, candidate } of deferred) {
      signal.throwIfAborted();
      if (taken.length >= count) break;
      await tryPick(order, pick, candidate);
    }
  } catch (error) {
    // 기한·취소로 끊긴 것만 여기까지 올라온다(그 밖의 실패는 후보 탈락으로 남기고 이어 간다). 고른 기록과 사용량을 들고 나간다.
    if (signal.aborted) throw new SelectionAbortedError(error, audit, usage);
    throw error;
  }
  taken.sort((a, b) => a.order - b.order);
  const fromPicks = taken.length;

  // 모자란 자리는 검증된 커리큘럼 개념으로 채운다. 이미 고른 것과 같은 개념(slug, 아티클·발굴 글이면 첫 참고 URL)은 빼고, 가능하면 고르지 않은 분야에서 고른다.
  const pool = candidates.filter((candidate) => candidate.concept && !taken.some(({ entry }) => entry.id === candidate.id));
  while (taken.length < count) {
    const open = pool.filter((candidate) => !sameAs(candidate.concept?.slug, candidate.concept?.references?.[0]?.url, false));
    const categories = takenCategories();
    const fallback = fallbackConcept(open.filter((candidate) => !categories.has(candidate.category)), recent) ?? fallbackConcept(open, recent);
    if (!fallback?.concept) break;
    pool.splice(pool.indexOf(fallback), 1);
    taken.push({
      order: Number.MAX_SAFE_INTEGER,
      choice: { concept: fallback.concept, mode: "new", evidence: [] },
      entry: { id: fallback.id, title: fallback.concept.title, format: fallback.format, category: fallback.category, fallback: true },
    });
  }
  // 대체할 미학습 개념도 바닥났다(커리큘럼을 다 돌았다). 빈 자리를 비워 두지 않고 복습 개념으로 채운다.
  fillFromCurriculum(true);

  if (!taken.length) {
    audit.status = "skipped";
    audit.error = audit.error ?? "검증을 통과한 후보가 없습니다.";
    return { choices: [], audit, usage };
  }
  // 추천을 하나도 쓰지 못했다면 대체다(복습 개념으로만 채웠다면 복습). 하나라도 썼다면 큐레이션이다(모자란 자리를 대체로 채웠어도).
  if (fromPicks === 0) audit.status = taken.every(({ choice }) => choice.mode === "review") ? "review" : "fallback";
  audit.chosen = taken.map(({ entry }) => entry);
  return { choices: taken.map(({ choice }) => choice), audit, usage };
}

/**
 * 작성 프롬프트의 모드. 고른 상식이 모두 복습일 때만 복습으로 쓴다.
 * 새 개념과 복습이 섞인 날은 new이고, 복습 안내는 reviewSlugs의 항목에만 준다. 새 개념을 '다른 각도로' 쓰게 하지 않는다.
 */
function sectionMode(choices: Choice[]): "new" | "review" {
  return choices.every((choice) => choice.mode === "review") ? "review" : "new";
}

/** 복습으로 고른 상식의 slug. 작성 프롬프트가 복습 안내('다른 각도·심화')를 이 항목에만 준다. */
function reviewSlugsOf(choices: Choice[]): string[] {
  return choices.filter((choice) => choice.mode === "review").map((choice) => choice.concept.slug);
}

/** 글에 이 slug가 나오는가. 다른 slug의 일부(q-dns-cache 안의 q-dns)로 나온 것은 치지 않는다. */
function mentionsSlug(text: string, slug: string): boolean {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(text);
}

/**
 * 생성을 실패하게 만든 위반·검토 사유. 마지막 시도 것만 본다. 앞선 시도에서 걸렸다가 고친 항목을 탓하지 않는다.
 * 검토(framing) 실패 사유는 briefing.unsupported 위반 문구로 들어 있다. 작성 전에 멈춘 오류는 그 문구다.
 */
function failureReasons(error: unknown): string {
  if (!(error instanceof BriefingValidationError)) return errorMessage(error);
  const last = Math.max(0, ...error.violations.map((violation) => violation.attempt));
  return error.violations.filter((violation) => violation.attempt === last).map((violation) => violation.message).join("\n");
}

/**
 * 테크 상식. 실패를 던지지 않는다. 무엇이 왜 빠졌는지는 audit에 담아 경제 파트의 생성 로그에 함께 남긴다.
 *
 * 빈 자리는 커리큘럼·복습 개념으로 채우므로 보통 TECH_CONCEPTS_PER_DAY개를 쓴다. 그보다 줄여 쓰는 것은 다음 때뿐이다(audit.narrowed).
 * - 여러 항목을 함께 작성·검토할 테크 시간(timeLeft)이 처음부터 모자라면 첫 항목만 쓴다.
 * - 여러 항목을 함께 쓰다 최종 실패하면 한 항목으로 줄여 다시 쓴다.
 * 고를 것이 없거나(빈 커리큘럼), 줄여 써도 통과하지 못하거나, signal(테크 기한 포함)로 끊기면 그날은 테크 상식을 빼고 발행한다.
 */
async function createTechSection(
  date: DateString,
  services: BriefingServices,
  signal: AbortSignal,
  timeLeft: () => number,
): Promise<{ section: TechSection | null; audit: TechAudit; usage: Usage }> {
  const audit: TechAudit = { ...emptyAudit(), attempts: 0, violations: [] };
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  /** 끝난 생성 실패의 사용량. 던지는 실패의 사용량은 아래 catch의 recordFailure가 더하므로, 던지지 않고 넘어가는 실패에만 쓴다. */
  const addFailureUsage = (error: unknown) => {
    if (!(error instanceof BriefingValidationError)) return;
    usage.inputTokens += error.usage.inputTokens;
    usage.outputTokens += error.usage.outputTokens;
  };

  try {
    const history = await services.getTechConceptHistory();
    const base = techCandidates(history);

    // 그날 검색으로 찾은 최근 기술 글. 실패해도 커리큘럼·아티클 후보만으로 고른다.
    audit.stage = "search";
    let topics: TechTopic[] = [];
    let discoveryError: string | undefined;
    try {
      const discovered = await services.discoverTechTopics(date, signal, {
        recentTitles: recentKnowledge(history, 14).map((entry) => entry.title),
      });
      usage.inputTokens += discovered.inputTokens;
      usage.outputTokens += discovered.outputTokens;
      usage.webSearchCalls += discovered.webSearchCalls;
      audit.searchTrace = discovered.searchTrace;
      audit.rejectedUrls = discovered.rejectedUrls;
      topics = discovered.topics;
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : String(error);
    }
    const candidates: KnowledgeCandidate[] = [
      ...base,
      ...topics.map((topic, index) => ({
        id: `d-${index + 1}`,
        format: topic.format,
        category: topic.field,
        level: 3,
        title: topic.title,
        note: `${topic.candidate.sources[0]?.publisher ?? ""} · ${topic.summary}`.slice(0, 220),
      })),
    ];

    audit.stage = "sources";
    const withDiscovery = (curation: CurationAudit): CurationAudit => ({
      ...curation,
      discovered: topics.length,
      ...(discoveryError ? { error: [curation.error, `발굴 실패: ${discoveryError}`].filter(Boolean).join(" / ") } : {}),
    });
    let picked: Awaited<ReturnType<typeof chooseKnowledge>>;
    try {
      picked = await chooseKnowledge("tech", { history, candidates, curriculum: TECH_CURRICULUM, topics, date, services, signal }, TECH_CONCEPTS_PER_DAY);
    } catch (error) {
      // 고르는 중 테크 기한·취소로 끊겼다. 그때까지의 큐레이션 기록·사용량은 남기고, 원래 오류로 테크를 생략한다.
      if (!(error instanceof SelectionAbortedError)) throw error;
      usage.inputTokens += error.usage.inputTokens;
      usage.outputTokens += error.usage.outputTokens;
      audit.curation = withDiscovery(error.audit);
      throw error.reason;
    }
    usage.inputTokens += picked.usage.inputTokens;
    usage.outputTokens += picked.usage.outputTokens;
    audit.curation = withDiscovery(picked.audit);
    if (!picked.choices.length) throw new Error(`테크 상식 발행 보류: ${picked.audit.error ?? "검증된 후보 없음"}`);

    audit.stage = "generation";
    const learnedTitles = collectLearnedTitles(history);
    const slugsOf = (choices: Choice[]) => choices.map((choice) => choice.concept.slug);
    // 고른 상식들의 원문을 합쳐 넘긴다. 원문마다 어느 상식의 근거인지(knowledgeSlug)가 붙어 있다. 개념형은 원문이 없다.
    const write = (choices: Choice[]) => {
      const evidence = choices.flatMap((choice) => choice.evidence);
      audit.evidence = auditEvidence(evidence);
      return services.generateTechSection({
        date,
        concepts: choices.map((choice) => choice.concept),
        mode: sectionMode(choices),
        reviewSlugs: reviewSlugsOf(choices),
        candidates: evidence,
        learnedTitles,
        signal,
      });
    };
    /**
     * 항목 items개를 쓰기 시작할 테크 시간이 남았는가. 기준은 items개 항목 호출 한 번의 제한 시간(timeoutForItems)이고, 이를 최소 시간으로 쓴다.
     * 작성·검토 전체에 드는 시간이 아니라 하한이다. 이보다 적게 남았으면 기한에 끊길 것이 뻔한 호출에 토큰을 쓰지 않는다.
     * 모자라면 그 사유, 충분하면 null.
     */
    const shortOfTime = (items: number) => {
      const left = timeLeft();
      const need = timeoutForItems(items);
      return left < need ? `남은 테크 시간(${Math.max(0, Math.round(left / 1000))}초)이 ${items}개 항목 호출 한 번의 제한 시간(${Math.round(need / 1000)}초, 최소 필요 시간)보다 적었다` : null;
    };
    /**
     * 여러 항목을 함께 쓰다 최종 실패했다. 한 항목의 문제로 그날 테크 상식 전체를 버리지 않도록 줄여서 다시 쓴다.
     * 실패 위반·검토 사유에 slug가 나오지 않은 항목을 남긴다. 어느 항목이 걸렸는지 가릴 수 없으면(모두 나오거나 하나도 안 나오면)
     * 앞 항목부터 하나씩 써 본다. 시도마다 남은 테크 시간이 호출 한 번의 제한 시간보다 적으면 시도하지 않는다.
     * 끝내 못 쓰면 마지막 실패를 던진다(테크 생략).
     */
    const rewriteNarrowed = async (all: Choice[], failure: unknown) => {
      const reasons = failureReasons(failure);
      const kept = all.filter((choice) => !mentionsSlug(reasons, choice.concept.slug));
      const tries = kept.length && kept.length < all.length ? [kept] : all.map((choice) => [choice]);
      const narrowed: NonNullable<TechAudit["narrowed"]> = {
        dropped: slugsOf(all),
        error: errorMessage(failure),
        violations: failure instanceof BriefingValidationError ? failure.violations : [],
        retries: [],
      };
      audit.narrowed = narrowed;
      let last = failure;
      for (const subset of tries) {
        const short = shortOfTime(subset.length);
        if (short) {
          narrowed.skipped = `${short}. ${slugsOf(subset).join(", ")}로 다시 쓰지 않았다.`;
          break;
        }
        // 앞선 실패는 여기서 끝난다(던지지 않는다). 그 사용량을 지금 더한다.
        addFailureUsage(last);
        narrowed.dropped = slugsOf(all.filter((choice) => !subset.includes(choice)));
        try {
          const generated = await write(subset);
          narrowed.retries?.push({ slugs: slugsOf(subset) });
          return { generated, choices: subset };
        } catch (error) {
          if (signal.aborted) throw error;
          narrowed.retries?.push({ slugs: slugsOf(subset), error: errorMessage(error) });
          last = error;
        }
      }
      throw last;
    };

    let choices = picked.choices;
    // 여러 항목을 함께 쓸 호출의 제한 시간만큼도 처음부터 남지 않았으면 첫 항목만 쓴다.
    const shortForAll = choices.length > 1 ? shortOfTime(choices.length) : null;
    if (shortForAll) {
      audit.narrowed = { dropped: slugsOf(choices.slice(1)), error: `${shortForAll}. 첫 항목만 썼다.`, violations: [] };
      choices = choices.slice(0, 1);
    }
    // 한 항목만 쓸 때도 호출 한 번의 제한 시간만큼 남지 않았으면 쓰지 않는다. 테크만 빠지고 경제 파트는 그대로 저장한다.
    const shortForOne = choices.length === 1 ? shortOfTime(1) : null;
    if (shortForOne) {
      const skipped = `${shortForOne}. ${slugsOf(choices).join(", ")} 작성을 건너뛰었다.`;
      if (audit.narrowed) audit.narrowed.skipped = skipped;
      throw new Error(skipped);
    }
    let generated: Awaited<ReturnType<typeof write>>;
    try {
      generated = await write(choices);
    } catch (error) {
      if (choices.length < 2 || signal.aborted) throw error;
      ({ generated, choices } = await rewriteNarrowed(choices, error));
    }
    usage.inputTokens += generated.inputTokens;
    usage.outputTokens += generated.outputTokens;
    audit.attempts = generated.attempts;
    audit.violations = generated.violations;
    audit.reviews = generated.reviews;

    audit.stage = "complete";
    return { section: markReview(generated.content, choices), audit, usage };
  } catch (error) {
    audit.violations = recordFailure(error, audit, usage, audit.violations);
    if (error instanceof BriefingValidationError) audit.attempts = audit.violations[audit.violations.length - 1]?.attempt ?? 0;
    const message = errorMessage(error);
    // 테크 기한·실행 취소로 끊겼다면 그 사유를 앞에 밝힌다. 하위 호출의 오류 문구(SDK의 "Request was aborted." 등)만으로는 왜 끊겼는지 알 수 없다.
    const reason = signal.aborted ? errorMessage(signal.reason) : "";
    audit.errorMessage = reason && !message.includes(reason) ? `${reason} (${message})` : message;
    // 경제 파트는 발행되므로 응답만으로는 실패가 드러나지 않는다. 서버 로그에도 남긴다.
    console.error(`[briefing] 테크 상식 생성 실패(${date}, ${audit.stage})`, audit.errorMessage, audit.violations);
    return { section: null, audit, usage };
  }
}

function emptyAudit(): GenerationAudit {
  return { stage: "history", searchTrace: [], rejectedUrls: [], sourceRejections: [], evidence: [], reviews: [] };
}

/** 복습으로 고른 상식이면 화면에도 남긴다. 항목마다 그 개념의 선택 모드를 따른다. AI 응답이 아니라 코드가 판단한 값이다. */
function markReview<T extends GroundedSection>(content: T, choices: Choice[]): T {
  const review = new Set(choices.filter((choice) => choice.mode === "review").map((choice) => choice.concept.slug));
  if (!review.size) return content;
  return { ...content, knowledgeItems: content.knowledgeItems.map((item) => (review.has(item.slug) ? { ...item, review: true } : item)) };
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
