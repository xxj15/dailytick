import { MANUAL_RUN_BUDGET_USD, OPENAI_PRICE_USD } from "@/config/app";
import type { DateString } from "@/lib/date";

/**
 * OpenAI 비용 계산. 생성 로그의 토큰·웹 검색 수로 사용액을 추정한다.
 * 크레딧이 빠듯하므로(2026-10-20) 수동 실행은 월 예산 안에서만 돌린다.
 */

export type Usage = { inputTokens: number; outputTokens: number; webSearchCalls: number };

/** 사용량의 추정 비용(USD). 캐시 할인은 빼고 보수적으로 센다. */
export function estimateCostUsd(usage: Usage): number {
  return (usage.inputTokens / 1_000_000) * OPENAI_PRICE_USD.inputPer1M +
    (usage.outputTokens / 1_000_000) * OPENAI_PRICE_USD.outputPer1M +
    usage.webSearchCalls * OPENAI_PRICE_USD.webSearchCall;
}

/** 기준일이 속한 달의 1일 0시(KST). 월 사용액을 이 시각부터 센다. */
export function monthStartKST(date: DateString): string {
  return `${date.slice(0, 7)}-01T00:00:00+09:00`;
}

/** 이번 달 수동 실행 예산을 다 썼다. 재생성·미리보기를 하지 않는다. */
export class BudgetExceededError extends Error {
  constructor(readonly spentUsd: number) {
    super(`이번 달 OpenAI 추정 사용액 $${spentUsd.toFixed(2)}가 수동 실행 예산 $${MANUAL_RUN_BUDGET_USD}에 닿아 재생성·미리보기를 하지 않습니다. 매일 자동 발행은 그대로 돈다.`);
    this.name = "BudgetExceededError";
  }
}
