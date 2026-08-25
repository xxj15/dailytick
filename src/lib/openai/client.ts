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
