import "server-only";
import { createHash } from "node:crypto";
import { TECH_DISCOVERY_MAX_AGE_DAYS } from "@/config/app";
import { CURRICULUM, type Concept } from "@/data/curriculum";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import {
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
import { collectMarketNews, discoverTechTopics, NewsCollectionError, type TechTopic } from "@/lib/openai/collect-news";
import { curateKnowledge, type CuratorPick } from "@/lib/openai/curate";
import { groundMarketNews, GroundNewsError } from "@/lib/openai/ground-news";
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
import type { Briefing, ConceptHistoryEntry, GroundedSection, NewsCandidate, RecentNewsEntry, TechSection } from "@/types/briefing";
import type { GroundedCandidate } from "@/lib/news/evidence-types";
import { auditEvidence, type CurationAudit, type GenerationAudit, type TechAudit } from "@/lib/news/generation-audit";
import type { BriefingViolation } from "@/types/briefing";

const defaultServices = {
  getBriefingByDate, getConceptHistory, getTechConceptHistory, getRecentNews,
  collectMarketNews, discoverTechTopics, curateKnowledge,
  groundMarketNews: (candidates: NewsCandidate[], date: DateString, signal?: AbortSignal, maxAgeHours?: number, allowUndated?: boolean) =>
    groundMarketNews(candidates, date, undefined, signal, maxAgeHours, allowUndated),
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
/** 주요 이슈를 한 번 더 수집하려면 이만큼은 남아 있어야 한다. (수집 90초 + 근거·작성·검토) */
const RECOLLECT_MIN_LEFT_MS = 170_000;

/**
 * 하루치 브리핑 생성 전체 흐름.
 *
 *   경제·주요 이슈: 최근 뉴스 조회 → 다섯 섹션 수집 → 본문 근거 확인(검색이 좁았으면 1회 재수집) → 경제 상식 큐레이션 → 작성·검토
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
    const news = await services.collectMarketNews(date, signal, { recentNews });
    addUsage(news);
    audit.searchTrace = news.searchTrace;
    audit.rejectedUrls = news.rejectedUrls;
    audit.stage = "sources";
    let candidates = news.candidates;
    let grounded = await services.groundMarketNews(candidates, date, signal);
    addUsage(grounded);

    // 근거가 확보된 이슈가 적은데 섹션을 덜 훑었다면, 시간이 될 때 빠진 섹션을 한 번 더 수집한다.
    const coverage = news.coverage ?? [];
    const searched = coverage.filter((entry) => entry.searched).length;
    let recollected = false;
    if (grounded.candidates.length < 3 && searched < 4 && timeLeft() > RECOLLECT_MIN_LEFT_MS) {
      const focusSections = ["politics", "world", "society", "economy", "tech"].filter(
        (section) => !coverage.some((entry) => entry.section === section && entry.searched),
      );
      const more = await services.collectMarketNews(date, signal, { recentNews, focusSections });
      addUsage(more);
      audit.searchTrace = [...audit.searchTrace, ...more.searchTrace];
      audit.rejectedUrls = [...audit.rejectedUrls, ...more.rejectedUrls];
      candidates = [...candidates, ...more.candidates.filter((entry) => !candidates.some((prev) => prev.title === entry.title))];
      grounded = await services.groundMarketNews(candidates, date, signal);
      addUsage(grounded);
      recollected = true;
      for (const entry of more.coverage ?? []) {
        const index = coverage.findIndex((prev) => prev.section === entry.section);
        if (index === -1) coverage.push(entry);
        else if (entry.searched) coverage[index] = entry;
      }
    }
    const searchedAfter = coverage.filter((entry) => entry.searched).length;
    audit.coverage = {
      sections: coverage,
      verdict: grounded.candidates.length >= 3 ? "ok" : searchedAfter >= 4 ? "thin_day" : "narrow_search",
      recollected,
      candidates: candidates.length,
      grounded: grounded.candidates.length,
    };
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
  const recent = recentKnowledge(history);

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
