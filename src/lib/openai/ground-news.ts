import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { NEWS_GROUND_LIMIT, NEWS_GROUND_PER_SLOT, NEWS_SLOTS } from "@/config/app";
import { isFreshSource, type DateString } from "@/lib/date";
import type { EvidenceRejection, SourceDocument } from "@/lib/news/evidence-types";
import { extractSource } from "@/lib/news/extract-source";
import { fetchSource, type SourceResponse } from "@/lib/news/fetch-source";
import { buildFactSelectionPrompt, factSelectionSchema, groundCandidates, isKoreanText, type CandidateDocuments, type FactSelection } from "@/lib/news/ground-candidates";
import { sourceUrlKey } from "@/lib/news/url-key";
import { fitsSlot } from "@/lib/news/slots";
import { getModel, getOpenAI, LIGHT_REASONING } from "@/lib/openai/client";
import type { NewsCandidate } from "@/types/briefing";

type SelectionResult = { selection: FactSelection; inputTokens: number; outputTokens: number };
/** 근거 문장 선택 한 번에 넘기는 후보 수. 후보마다 본문 최대 FACT_TEXT_LIMIT자가 함께 간다. */
const SELECT_BATCH = 4;
export class GroundNewsError extends Error {
  constructor(message: string, readonly rejected: EvidenceRejection[]) { super(message); }
}
type GroundNewsDependencies = {
  fetch: (url: string, signal?: AbortSignal) => Promise<SourceResponse>;
  select: (inputs: CandidateDocuments[], date: DateString, signal?: AbortSignal) => Promise<SelectionResult>;
};

async function selectFacts(inputs: CandidateDocuments[], date: DateString, signal?: AbortSignal): Promise<SelectionResult> {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildFactSelectionPrompt(inputs, date),
    reasoning: LIGHT_REASONING,
    text: { format: zodTextFormat(factSelectionSchema, "evidence_selection") },
  }, { timeout: 60_000, maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("근거 문장 선택 결과가 없습니다.");
  return {
    selection: factSelectionSchema.parse(response.output_parsed),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

/**
 * 본문을 읽을 후보를 NEWS_GROUND_LIMIT개로 줄인다.
 * 슬롯마다 상위 후보 자리를 먼저 잡고 나머지를 중요도 순으로 채운다. 중요도로만 자르면 국내·IT 후보가 통째로 빠질 수 있다.
 * 결과는 중요도 순서를 유지한다.
 */
export function boundForGrounding(candidates: NewsCandidate[]): NewsCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.importance - a.importance);
  const kept = new Set(NEWS_SLOTS.flatMap((slot) => sorted.filter((candidate) => fitsSlot(slot, candidate)).slice(0, NEWS_GROUND_PER_SLOT)));
  for (const candidate of sorted) {
    if (kept.size >= NEWS_GROUND_LIMIT) break;
    kept.add(candidate);
  }
  return sorted.filter((candidate) => kept.has(candidate));
}

/** 수집 실패는 후보별로 기록한다. 확보한 본문이 없으면 AI를 호출하지 않는다. */
export async function groundMarketNews(
  candidates: NewsCandidate[],
  date: DateString,
  dependencies: GroundNewsDependencies = { fetch: fetchSource, select: selectFacts },
  signal?: AbortSignal,
  maxAgeHours?: number,
  /** 오래돼도 읽을 가치가 있는 아티클처럼 게시일이 필수가 아닌 자료. 게시일이 있으면 그대로 기록한다. */
  allowUndated = false,
  /**
   * 후보 id 접두어. id는 `${idPrefix}1`부터 매기고 근거 문장 id는 `${id}-f1`이다.
   * 테크 상식처럼 여러 근거 확인 결과를 함께 넘길 때 id가 겹치지 않도록 다른 접두어를 쓴다.
   */
  idPrefix = "c",
  /**
   * 한국어 기사 본문만 근거로 쓴다. 주요 이슈는 근거 문장이 지면에 그대로 실리므로 기본값이다.
   * 테크 상식은 영문 원문을 한국어로 풀어 쓰므로 false로 부른다.
   */
  koreanOnly = true,
) {
  const fresh = (publishedAt: string | undefined) => (allowUndated ? true : isFreshSource(publishedAt, date, maxAgeHours));
  const rejected: EvidenceRejection[] = [];
  const inputs: CandidateDocuments[] = [];
  const cache = new Map<string, Promise<SourceDocument>>();
  const bounded = boundForGrounding(candidates);
  // 동시에 최대 세 후보를 읽는다. URL당 응답 크기·시간도 fetchSource에서 제한한다.
  for (let offset = 0; offset < bounded.length; offset += 3) {
    signal?.throwIfAborted();
    const batch = await Promise.all(bounded.slice(offset, offset + 3).map(async (candidate, index) => {
      const id = `${idPrefix}${offset + index + 1}`;
      const documents: SourceDocument[] = [];
      // 한국어 제목의 출처부터 읽는다. 앞에 놓인 영문 기사 때문에 뒤의 한국어 기사가 잘리지 않게 한다.
      const sources = koreanOnly
        ? [...candidate.sources].sort((a, b) => Number(isKoreanText(b.title)) - Number(isKoreanText(a.title)))
        : candidate.sources;
      for (const source of sources.slice(0, 3)) {
        try {
          const key = sourceUrlKey(source.url);
          if (!key) throw new Error("수집할 수 없는 출처 URL입니다.");
          let pending = cache.get(key);
          if (!pending) {
            pending = dependencies.fetch(key, signal).then((response) => extractSource(response, key));
            cache.set(key, pending);
          }
          const doc = await pending;
          if (!fresh(doc.source.publishedAt)) {
            rejected.push({ candidateId: id, url: source.url, reason: "본문의 게시일이 없거나 최신 범위를 벗어났습니다." });
            continue;
          }
          if (koreanOnly && !isKoreanText(doc.text)) {
            rejected.push({ candidateId: id, url: source.url, reason: "한국어 기사가 아닙니다." });
            continue;
          }
          documents.push(doc);
          break;
        } catch (error) {
          rejected.push({ candidateId: id, url: source.url, reason: error instanceof Error ? error.message : String(error) });
        }
      }
      return { id, candidate, documents };
    }));
    inputs.push(...batch.filter((input) => input.documents.length));
  }
  if (!inputs.length) return { candidates: [], rejected, inputTokens: 0, outputTokens: 0 };
  signal?.throwIfAborted();
  // 긴 본문을 한 번에 너무 많이 넘기면 앞쪽 몇 건만 고르고 나머지를 빠뜨린다. 4건씩 나눠 동시에 고른다.
  const batches: CandidateDocuments[][] = [];
  for (let offset = 0; offset < inputs.length; offset += SELECT_BATCH) batches.push(inputs.slice(offset, offset + SELECT_BATCH));
  let results: SelectionResult[];
  try {
    results = await Promise.all(batches.map((batch) => dependencies.select(batch, date, signal)));
  } catch (error) {
    throw new GroundNewsError(error instanceof Error ? error.message : String(error), rejected);
  }
  const selection: FactSelection = { candidates: results.flatMap((result) => result.selection.candidates) };
  const grounded = groundCandidates(inputs, selection, date, maxAgeHours, allowUndated, koreanOnly);
  return {
    ...grounded,
    rejected: [...rejected, ...grounded.rejected],
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
  };
}
