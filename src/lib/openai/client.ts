import "server-only";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

/**
 * OpenAI는 서버에서만 호출한다. API Key는 절대 브라우저로 내려가지 않는다.
 *
 * 모델명은 코드에 하드코딩하지 않고 OPENAI_MODEL 환경변수로만 관리한다.
 * 모델 교체는 .env 한 줄 수정으로 끝나야 한다.
 */
let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cached) return cached;

  cached = new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
  return cached;
}

export function getModel(): string {
  return getServerEnv().OPENAI_MODEL;
}

/**
 * 작성·검토 호출 한 번의 제한 시간. 상식 항목 하나 기준 60초에, 항목이 하나 늘 때마다 30초를 더한다.
 * 테크 상식처럼 여러 항목을 한 번에 쓰고 검토하는 호출이 항목 하나 기준 시간에 걸리지 않게 한다.
 */
export function timeoutForItems(items: number): number {
  return 60_000 + 30_000 * Math.max(0, items - 1);
}
