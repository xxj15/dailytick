import { strict as assert } from "node:assert";
import test from "node:test";
import { estimateCostUsd, monthStartKST } from "@/lib/cost";

test("사용량을 gpt-5.6-luna 공식 단가로 계산한다", () => {
  // 입력 100만 토큰 $0.20 + 출력 100만 토큰 $1.20 + 웹 검색 100번 $1.00
  assert.equal(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000, webSearchCalls: 100 }).toFixed(2), "2.40");
  // 10-20 웹 검색 시절 한 번의 생성(입력 38만·출력 2.4만·검색 31번)은 약 $0.42였다
  assert.equal(estimateCostUsd({ inputTokens: 383_628, outputTokens: 24_038, webSearchCalls: 31 }).toFixed(2), "0.42");
});

test("월 사용액은 기준일이 속한 달 1일 0시(KST)부터 센다", () => {
  assert.equal(monthStartKST("2026-10-20"), "2026-10-01T00:00:00+09:00");
  assert.equal(monthStartKST("2026-11-01"), "2026-11-01T00:00:00+09:00");
});
