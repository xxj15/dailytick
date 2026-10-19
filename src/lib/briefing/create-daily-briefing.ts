import "server-only";
import { createHash } from "node:crypto";
import { NEWS_SLOTS, TECH_DISCOVERY_MAX_AGE_DAYS } from "@/config/app";
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
import { getModel } from "@/lib/openai/client";
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
  groundMarketNews: (candidates: NewsCandidate[], date: DateString, signal?: AbortSignal, maxAgeHours?: number, allowUndated?: boolean, idPrefix?: string) =>
    groundMarketNews(candidates, date, undefined, signal, maxAgeHours, allowUndated, idPrefix),
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
 */
const RETRY_AFTER_TIMEOUT_MIN_LEFT_MS = 150_000;

/**
 * 하루치 브리핑 생성 전체 흐름.
 *
 *   경제·주요 이슈: 최근 뉴스 조회 → 슬롯별 후보 수집(슬롯마다 병렬 호출) → 본문 근거 확인(빈 슬롯이 있으면 그 슬롯만 1회 재수집) → 경제 상식 큐레이션 → 작성·검토
 *   테크 상식:     학습 이력 → 그날 기술 글 발굴 → 큐레이션 → (아티클·트렌드면) 원문 근거 확인 → 작성·검토
 *
 * 두 흐름은 동시에 돈다. 경제·주요 이슈가 지면의 본체라 실패하면 발행하지 않는다.
 * 테크 상식은 검증된 후보가 없으면 그날만 빼고 발행한다.
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
  const techRun = createTechSection(date, services, AbortSignal.any([signal, techStop.signal]));
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
    });
    addUsage(economy.usage);
    audit.curation = economy.audit;
    if (!economy.choice) throw new Error(`경제 상식을 고르지 못했습니다: ${economy.audit.error ?? "검증된 후보 없음"}`);

    audit.stage = "generation";
    const generated = await services.generateDailyBriefing({
      date,
      concepts: [economy.choice.concept],
      mode: economy.choice.mode,
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

    const content = markReview(generated.content, economy.choice.mode);
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

type Choice = { concept: Concept; mode: "new" | "review"; evidence: GroundedCandidate[] };

/**
 * 상식 하나를 고른다.
 *
 * 큐레이터가 추천한 순서대로 검증을 시도한다. 아티클·검색 후보는 원문 근거 확인을 통과해야만 쓴다.
 * 추천을 하나도 쓰지 못하면 사람이 검증한 커리큘럼 개념으로 대체하고, 그마저 없으면 고르지 않는다(발행 보류).
 * 미학습 개념이 하나도 없으면 커리큘럼 복습으로 넘어간다.
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
): Promise<{ choice: Choice | null; audit: CurationAudit; usage: Usage }> {
  const { history, candidates, date, services, signal } = params;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
  // 경제 상식은 후보를 다섯 갈래로 보여주므로 최근 이력도 같은 갈래 이름으로 맞춘다. 그래야 겹침 감점이 작동한다.
  const recent = recentKnowledge(history).map((entry) =>
    kind === "economy" ? { ...entry, category: ECONOMY_GROUP[entry.category ?? ""] ?? entry.category } : entry,
  );

  if (!candidates.length) {
    const { concepts } = selectTodayConcepts(history, params.curriculum, 1, false);
    return concepts[0]
      ? { choice: { concept: { ...concepts[0], format: concepts[0].format ?? "concept" }, mode: "review", evidence: [] }, audit: { status: "review", chosen: { id: `k-${concepts[0].slug}`, title: concepts[0].title, format: "concept" } }, usage }
      : { choice: null, audit: { status: "skipped", error: "커리큘럼이 비어 있습니다." }, usage };
  }

  const audit: CurationAudit = { status: "curated", rejected: [] };
  let picks: CuratorPick[] = [];
  try {
    const curated = await services.curateKnowledge({
      kind, date, recent, newsTitles: params.newsTitles,
      candidates: candidates.map(({ id, format, category, level, title, note }) => ({ id, format, category, level, title, note })),
    }, signal);
    usage.inputTokens += curated.inputTokens;
    usage.outputTokens += curated.outputTokens;
    picks = curated.picks;
    audit.picks = picks;
  } catch (error) {
    audit.error = `큐레이터 실패: ${error instanceof Error ? error.message : String(error)}`;
  }

  for (const pick of picks) {
    const candidate = candidates.find((entry) => entry.id === pick.id);
    if (!candidate) {
      audit.rejected?.push(`${pick.id}: 후보 목록에 없는 id`);
      continue;
    }
    if (candidate.concept) {
      audit.chosen = { id: candidate.id, title: candidate.concept.title, format: candidate.format, reason: pick.reason };
      return { choice: { concept: candidate.concept, mode: "new", evidence: [] }, audit, usage };
    }

    // 아티클·검색 후보: 서버가 원문을 읽어 근거 문장을 확인한 뒤에만 쓴다.
    const source = candidate.article
      ? { title: candidate.article.title, summary: candidate.article.takeaway, region: "GLOBAL" as const, category: candidate.category === "ai" ? "ai" as const : "software" as const, importance: 8,
          sources: [{ publisher: candidate.article.publisher, title: candidate.article.title, url: candidate.article.url }] }
      : params.topics?.[Number(candidate.id.slice(2)) - 1]?.candidate;
    if (!source) {
      audit.rejected?.push(`${candidate.id}: 원문 정보 없음`);
      continue;
    }
    try {
      const grounded = await services.groundMarketNews(
        [source], date, signal,
        candidate.article ? undefined : TECH_DISCOVERY_MAX_AGE_DAYS * 24,
        Boolean(candidate.article),
      );
      usage.inputTokens += grounded.inputTokens;
      usage.outputTokens += grounded.outputTokens;
      const evidence = grounded.candidates[0];
      if (!evidence) {
        audit.rejected?.push(`${candidate.id}: ${grounded.rejected.map((entry) => entry.reason).join(" / ") || "원문 근거 확인 실패"}`);
        continue;
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
      audit.chosen = { id: candidate.id, title: concept.title, format: candidate.format, reason: pick.reason };
      return { choice: { concept, mode: "new", evidence: [evidence] }, audit, usage };
    } catch (error) {
      audit.rejected?.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 추천을 하나도 쓰지 못했다. 검증된 커리큘럼 개념이 있으면 그것으로 대체한다.
  const fallback = fallbackConcept(candidates, recent);
  if (fallback?.concept) {
    audit.status = "fallback";
    audit.chosen = { id: fallback.id, title: fallback.concept.title, format: fallback.format };
    return { choice: { concept: fallback.concept, mode: "new", evidence: [] }, audit, usage };
  }
  audit.status = "skipped";
  audit.error = audit.error ?? "검증을 통과한 후보가 없습니다.";
  return { choice: null, audit, usage };
}

/**
 * 테크 상식. 실패를 던지지 않는다. 고르지 못하거나 작성·검토를 통과하지 못하면 그날은 빼고 발행한다.
 * 무엇이 왜 빠졌는지는 audit에 담아 경제 파트의 생성 로그에 함께 남긴다.
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
    const picked = await chooseKnowledge("tech", { history, candidates, curriculum: TECH_CURRICULUM, topics, date, services, signal });
    usage.inputTokens += picked.usage.inputTokens;
    usage.outputTokens += picked.usage.outputTokens;
    audit.curation = { ...picked.audit, discovered: topics.length, ...(discoveryError ? { error: [picked.audit.error, `발굴 실패: ${discoveryError}`].filter(Boolean).join(" / ") } : {}) };
    if (!picked.choice) throw new Error(`테크 상식 발행 보류: ${picked.audit.error ?? "검증된 후보 없음"}`);
    audit.evidence = auditEvidence(picked.choice.evidence);

    audit.stage = "generation";
    const generated = await services.generateTechSection({
      date,
      concepts: [picked.choice.concept],
      mode: picked.choice.mode,
      candidates: picked.choice.evidence,
      learnedTitles: collectLearnedTitles(history),
      signal,
    });
    usage.inputTokens += generated.inputTokens;
    usage.outputTokens += generated.outputTokens;
    audit.attempts = generated.attempts;
    audit.violations = generated.violations;
    audit.reviews = generated.reviews;

    audit.stage = "complete";
    return { section: markReview(generated.content, picked.choice.mode), audit, usage };
  } catch (error) {
    audit.violations = recordFailure(error, audit, usage, audit.violations);
    if (error instanceof BriefingValidationError) audit.attempts = audit.violations[audit.violations.length - 1]?.attempt ?? 0;
    audit.errorMessage = error instanceof Error ? error.message : String(error);
    // 경제 파트는 발행되므로 응답만으로는 실패가 드러나지 않는다. 서버 로그에도 남긴다.
    console.error(`[briefing] 테크 상식 생성 실패(${date}, ${audit.stage})`, audit.errorMessage, audit.violations);
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
