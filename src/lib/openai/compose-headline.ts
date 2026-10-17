import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { DateString } from "@/lib/date";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildHeadlinePrompt } from "@/lib/openai/prompts";
import { aiHeadlineSchema, headlineSchema } from "@/lib/openai/schemas";
import type { DailyBriefingContent, TechSection } from "@/types/briefing";

/** 발행이 확정된 두 파트의 제목만 넘긴다. 본문·근거는 다시 읽히지 않는다. */
export async function composeHeadline(
  params: { date: DateString; economy: DailyBriefingContent; tech: TechSection },
  signal?: AbortSignal,
) {
  const titles = (section: Pick<DailyBriefingContent, "knowledgeItems" | "newsItems">) => ({
    newsTitles: section.newsItems.map((item) => item.title),
    conceptTitles: section.knowledgeItems.map((item) => item.title),
  });
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildHeadlinePrompt({ date: params.date, tech: titles(params.tech), economy: titles(params.economy) }),
    text: { format: zodTextFormat(aiHeadlineSchema, "headline") },
  }, { timeout: 30_000, maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("키워드 합성 결과가 없습니다.");
  return {
    headline: headlineSchema.parse(response.output_parsed),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
