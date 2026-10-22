/**
 * 상식끼리의 관계. 사람이 정한다. AI가 정하지 않는다.
 *
 * LEGACY_SLUGS
 *   예전 커리큘럼 slug → 지금 slug. 같은 개념이다. 학습 이력을 읽을 때 지금 slug로 바꿔,
 *   이미 배운 개념을 새 개념처럼 다시 내지 않는다(10-17 browser-rendering을 배우고 10-20 q-rendering-pipeline이 또 나갔다).
 *
 * OVERLAP_GROUPS
 *   학습 범위가 크게 겹치는 상식 묶음(커리큘럼 개념·아티클). 한 묶음에서 최근 KNOWLEDGE_OVERLAP_DAYS일 안에 하나가 나갔으면
 *   나머지는 후보와 대체 풀에 올리지 않는다(curation/candidates.ts recentOverlaps). 그 기간이 지나면 다시 고를 수 있다.
 *   다음 단계를 배우는 심화 관계(트랜잭션 → 격리 수준, 임베딩 → RAG)는 묶지 않는다. 같은 내용을 되풀이하는 관계만 묶는다.
 */

export const LEGACY_SLUGS: Record<string, string> = {
  "browser-rendering": "q-rendering-pipeline",
  "reflow-repaint": "q-reflow",
};

export const OVERLAP_GROUPS: readonly (readonly string[])[] = [
  // 테크 · 프론트엔드
  ["q-rendering-pipeline", "q-reflow"],
  ["q-single-thread", "q-settimeout-zero"],
  ["q-react-rerender", "a-why-react-rerenders"],
  ["q-effect-twice", "a-complete-guide-useeffect"],
  ["q-state-where", "a-state-management-kcd", "a-practical-react-query", "a-dont-overuse-state"],
  ["q-where-render", "q-hydration", "a-rendering-on-the-web"],
  ["q-server-components", "a-two-reacts", "a-making-sense-rsc"],
  ["q-flex-grid", "a-flexbox-guide"],
  ["q-lighthouse", "a-optimize-inp"],
  ["a-cost-of-javascript", "q-tree-shaking", "q-lazy-loading"],
  // 테크 · CS·백엔드
  ["q-http-versions", "a-cloudflare-quic"],
  ["q-https-lock", "q-https-cert"],
  ["q-isolation-level", "q-optimistic-lock"],
  ["q-reverse-proxy", "a-cloudflare-pingora"],
  // 테크 · AI
  ["q-ai-agent", "a-building-effective-agents", "a-llm-agents-lilian"],
  ["q-context-window", "a-context-engineering"],
  ["q-tool-calling", "q-mcp"],
  ["q-ai-eval", "a-toss-benchmark"],
  ["a-genai-platform", "a-toss-ai-platform"],
  // 경제
  ["inflation", "cpi"],
  ["trade-balance", "current-account"],
  ["fixed-variable-cost", "break-even-point"],
  ["profit-margin", "operating-vs-net-income"],
  ["household-debt", "housing-and-rates"],
  ["corporate-governance", "board-and-agm"],
  ["payment-pg", "card-payment-flow"],
];
