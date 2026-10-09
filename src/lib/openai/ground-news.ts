import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { NEWS_CANDIDATE_COUNT } from "@/config/app";
import { isFreshSource, type DateString } from "@/lib/date";
import type { EvidenceRejection, SourceDocument } from "@/lib/news/evidence-types";
import { extractSource } from "@/lib/news/extract-source";
import { fetchSource, type SourceResponse } from "@/lib/news/fetch-source";
import { buildFactSelectionPrompt, factSelectionSchema, groundCandidates, type CandidateDocuments, type FactSelection } from "@/lib/news/ground-candidates";
import { sourceUrlKey } from "@/lib/news/search-provenance";
import { getModel, getOpenAI } from "@/lib/openai/client";
import type { NewsCandidate } from "@/types/briefing";

type SelectionResult = { selection: FactSelection; inputTokens: number; outputTokens: number };
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
    text: { format: zodTextFormat(factSelectionSchema, "evidence_selection") },
  }, { timeout: 60_000, maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("근거 문장 선택 결과가 없습니다.");
  return {
    selection: factSelectionSchema.parse(response.output_parsed),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

/** 수집 실패는 후보별로 기록한다. 확보한 본문이 없으면 AI를 호출하지 않는다. */
export async function groundMarketNews(
  candidates: NewsCandidate[],
  date: DateString,
  dependencies: GroundNewsDependencies = { fetch: fetchSource, select: selectFacts },
  signal?: AbortSignal,
) {
  const rejected: EvidenceRejection[] = [];
  const inputs: CandidateDocuments[] = [];
  const cache = new Map<string, Promise<SourceDocument>>();
  const bounded = [...candidates].sort((a, b) => b.importance - a.importance).slice(0, NEWS_CANDIDATE_COUNT.max);
  // 동시에 최대 세 후보를 읽는다. URL당 응답 크기·시간도 fetchSource에서 제한한다.
  for (let offset = 0; offset < bounded.length; offset += 3) {
    signal?.throwIfAborted();
    const batch = await Promise.all(bounded.slice(offset, offset + 3).map(async (candidate, index) => {
      const id = `c${offset + index + 1}`;
      const documents: SourceDocument[] = [];
      for (const source of candidate.sources.slice(0, 3)) {
        try {
          const key = sourceUrlKey(source.url);
          if (!key) throw new Error("수집할 수 없는 출처 URL입니다.");
          let pending = cache.get(key);
          if (!pending) {
            pending = dependencies.fetch(key, signal).then((response) => extractSource(response, key));
            cache.set(key, pending);
          }
          const doc = await pending;
          if (isFreshSource(doc.source.publishedAt, date)) {
            documents.push(doc);
            break;
          }
          rejected.push({ candidateId: id, url: source.url, reason: "본문의 게시일이 없거나 최신 범위를 벗어났습니다." });
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
  let result;
  try {
    result = await dependencies.select(inputs, date, signal);
  } catch (error) {
    throw new GroundNewsError(error instanceof Error ? error.message : String(error), rejected);
  }
  const grounded = groundCandidates(inputs, result.selection, date);
  return { ...grounded, rejected: [...rejected, ...grounded.rejected], inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
