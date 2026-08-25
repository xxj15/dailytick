import "server-only";
import { getSupabase } from "@/lib/supabase/client";
import type { DateString } from "@/lib/date";
import type { GenerationStatus } from "@/types/briefing";

const TABLE = "generation_logs";

/**
 * 생성 로그.
 *
 * 로그 기록 실패가 브리핑 생성 자체를 깨뜨려서는 안 된다.
 * 그래서 모든 함수는 예외를 밖으로 던지지 않고 콘솔에만 남긴다.
 */
export async function startGenerationLog(
  date: DateString,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert({ briefing_date: date, status: "running" satisfies GenerationStatus })
      .select("id")
      .single<{ id: string }>();

    if (error) throw new Error(error.message);
    return data.id;
  } catch (error) {
    console.error("[generation-log] 시작 기록 실패", error);
    return null;
  }
}

export async function finishGenerationLog(
  id: string | null,
  result: {
    status: GenerationStatus;
    inputTokens?: number;
    outputTokens?: number;
    webSearchCalls?: number;
    errorMessage?: string;
  },
): Promise<void> {
  if (!id) return;

  try {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({
        status: result.status,
        finished_at: new Date().toISOString(),
        input_tokens: result.inputTokens ?? null,
        output_tokens: result.outputTokens ?? null,
        web_search_calls: result.webSearchCalls ?? null,
        // 긴 스택 전체를 넣지 않는다.
        error_message: result.errorMessage?.slice(0, 1000) ?? null,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[generation-log] 종료 기록 실패", error);
  }
}
