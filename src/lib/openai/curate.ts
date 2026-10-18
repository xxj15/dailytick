import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { getModel, getOpenAI } from "@/lib/openai/client";
import { buildCuratorPrompt } from "@/lib/openai/prompts";
import { curatorSchema } from "@/lib/openai/schemas";

export type CuratorPick = { id: string; title: string; reason: string };

/**
 * 상식 큐레이터 호출. 웹 검색 없이 주어진 후보만 평가한다.
 * 반환한 id가 실제 후보인지, 이미 다룬 주제가 아닌지는 부르는 쪽(코드)이 다시 확인한다.
 */
export async function curateKnowledge(params: Parameters<typeof buildCuratorPrompt>[0], signal?: AbortSignal) {
  const response = await getOpenAI().responses.parse({
    model: getModel(),
    input: buildCuratorPrompt(params),
    text: { format: zodTextFormat(curatorSchema, "curation") },
  }, { timeout: 45_000, maxRetries: 0, signal });
  if (!response.output_parsed) throw new Error("큐레이터 응답이 없습니다.");
  return {
    picks: curatorSchema.parse(response.output_parsed).picks.slice(0, 3) as CuratorPick[],
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
