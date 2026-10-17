import type { Concept } from "@/data/curriculum";

/**
 * IT 개념 Curriculum.
 *
 * 경제 커리큘럼과 같은 규칙을 따른다. AI가 주제를 고르지 않고 이 배열 순서대로 나간다.
 * 독자는 현업 프론트엔드 개발자다. 매일 쓰지만 원리까지는 설명하기 어려운 것부터
 * 웹 플랫폼 → JS·TS → React → 성능 → 인프라 → CS 기초 → AI 개발 순서로 쌓는다.
 */

export type TechCurriculumCategory =
  | "web-platform"
  | "javascript"
  | "typescript"
  | "react"
  | "performance"
  | "web-security"
  | "infra"
  | "cs"
  | "ai-dev";

export type TechCurriculumConcept = Concept & { category: TechCurriculumCategory };

export const TECH_CURRICULUM: TechCurriculumConcept[] = [
  // LEVEL 1 — 브라우저와 웹 플랫폼
  { slug: "browser-rendering", title: "브라우저 렌더링 파이프라인", level: 1, category: "web-platform", pairWith: "reflow-repaint" },
  { slug: "reflow-repaint", title: "리플로우와 리페인트", level: 1, category: "web-platform" },
  { slug: "event-loop", title: "이벤트 루프와 태스크 큐", level: 1, category: "web-platform", pairWith: "microtask" },
  { slug: "microtask", title: "마이크로태스크와 매크로태스크", level: 1, category: "web-platform" },
  { slug: "dom-events", title: "이벤트 버블링·캡처링과 위임", level: 1, category: "web-platform" },
  { slug: "web-storage", title: "쿠키·localStorage·sessionStorage", level: 1, category: "web-platform" },
  { slug: "http-cache", title: "HTTP 캐시와 Cache-Control", level: 1, category: "web-platform" },
  { slug: "http2-http3", title: "HTTP/2와 HTTP/3", level: 1, category: "web-platform" },
  { slug: "web-workers", title: "Web Worker와 Service Worker", level: 1, category: "web-platform" },

  // LEVEL 2 — JavaScript
  { slug: "closure", title: "클로저", level: 2, category: "javascript" },
  { slug: "this-binding", title: "this 바인딩", level: 2, category: "javascript" },
  { slug: "prototype", title: "프로토타입 체인", level: 2, category: "javascript" },
  { slug: "promise-async", title: "Promise와 async/await", level: 2, category: "javascript" },
  { slug: "es-modules", title: "ES 모듈과 CommonJS", level: 2, category: "javascript" },
  { slug: "garbage-collection", title: "가비지 컬렉션과 메모리 누수", level: 2, category: "javascript" },
  { slug: "equality-coercion", title: "타입 변환과 동등 비교", level: 2, category: "javascript" },

  // LEVEL 3 — TypeScript
  { slug: "structural-typing", title: "구조적 타이핑", level: 3, category: "typescript" },
  { slug: "generics", title: "제네릭", level: 3, category: "typescript" },
  { slug: "type-narrowing", title: "타입 좁히기와 판별 유니온", level: 3, category: "typescript" },
  { slug: "utility-types", title: "유틸리티 타입과 조건부 타입", level: 3, category: "typescript" },
  { slug: "any-unknown-never", title: "any·unknown·never", level: 3, category: "typescript" },

  // LEVEL 4 — React와 렌더링 전략
  { slug: "reconciliation", title: "Virtual DOM과 재조정", level: 4, category: "react" },
  { slug: "react-rendering", title: "리렌더링이 일어나는 조건", level: 4, category: "react", pairWith: "memoization" },
  { slug: "memoization", title: "memo·useMemo·useCallback", level: 4, category: "react" },
  { slug: "useeffect", title: "useEffect와 의존성 배열", level: 4, category: "react" },
  { slug: "state-management", title: "상태 관리: 로컬·전역·서버 상태", level: 4, category: "react" },
  { slug: "concurrent-rendering", title: "동시성 렌더링과 Suspense", level: 4, category: "react" },
  { slug: "csr-ssr-ssg", title: "CSR·SSR·SSG·ISR", level: 4, category: "react", pairWith: "hydration" },
  { slug: "hydration", title: "하이드레이션", level: 4, category: "react" },
  { slug: "server-components", title: "React 서버 컴포넌트", level: 4, category: "react" },

  // LEVEL 5 — 성능과 접근성
  { slug: "core-web-vitals", title: "Core Web Vitals (LCP·INP·CLS)", level: 5, category: "performance" },
  { slug: "bundling-tree-shaking", title: "번들링과 트리 셰이킹", level: 5, category: "performance" },
  { slug: "code-splitting", title: "코드 스플리팅과 지연 로딩", level: 5, category: "performance" },
  { slug: "image-optimization", title: "이미지 최적화", level: 5, category: "performance" },
  { slug: "debounce-throttle", title: "디바운스와 스로틀", level: 5, category: "performance" },
  { slug: "virtualization-list", title: "리스트 가상화", level: 5, category: "performance" },
  { slug: "web-accessibility", title: "웹 접근성과 ARIA", level: 5, category: "performance" },

  // LEVEL 6 — 웹 보안
  { slug: "cors", title: "CORS", level: 6, category: "web-security" },
  { slug: "xss-csrf", title: "XSS와 CSRF", level: 6, category: "web-security" },
  { slug: "csp", title: "콘텐츠 보안 정책(CSP)", level: 6, category: "web-security" },
  { slug: "auth-jwt-session", title: "세션 인증과 JWT", level: 6, category: "web-security" },
  { slug: "oauth-oidc", title: "OAuth 2.0과 OIDC", level: 6, category: "web-security" },
  { slug: "supply-chain", title: "npm 공급망 보안", level: 6, category: "web-security" },

  // LEVEL 7 — 인프라와 배포
  { slug: "dns-tls", title: "DNS와 TLS 핸드셰이크", level: 7, category: "infra" },
  { slug: "cdn-edge", title: "CDN과 엣지 컴퓨팅", level: 7, category: "infra" },
  { slug: "serverless", title: "서버리스와 콜드 스타트", level: 7, category: "infra" },
  { slug: "ci-cd", title: "CI/CD와 프리뷰 배포", level: 7, category: "infra" },
  { slug: "containers", title: "컨테이너와 Docker", level: 7, category: "infra" },
  { slug: "monorepo", title: "모노레포", level: 7, category: "infra" },
  { slug: "observability", title: "로그·메트릭·트레이싱", level: 7, category: "infra" },

  // LEVEL 8 — CS 기초
  { slug: "time-complexity", title: "시간복잡도와 Big-O", level: 8, category: "cs" },
  { slug: "hash-table", title: "해시 테이블", level: 8, category: "cs" },
  { slug: "tree-graph", title: "트리와 그래프 탐색", level: 8, category: "cs" },
  { slug: "process-thread", title: "프로세스와 스레드", level: 8, category: "cs" },
  { slug: "tcp-udp", title: "TCP와 UDP", level: 8, category: "cs" },
  { slug: "db-index-transaction", title: "DB 인덱스와 트랜잭션", level: 8, category: "cs" },
  { slug: "rest-graphql", title: "REST와 GraphQL", level: 8, category: "cs" },
  { slug: "websocket-sse", title: "WebSocket과 SSE", level: 8, category: "cs" },

  // LEVEL 9 — AI와 개발
  { slug: "llm-tokens-context", title: "LLM의 토큰과 컨텍스트 윈도", level: 9, category: "ai-dev" },
  { slug: "prompt-design", title: "프롬프트 설계", level: 9, category: "ai-dev" },
  { slug: "structured-output", title: "구조화된 출력과 도구 호출", level: 9, category: "ai-dev" },
  { slug: "embedding-vector", title: "임베딩과 벡터 검색", level: 9, category: "ai-dev", pairWith: "rag" },
  { slug: "rag", title: "RAG(검색 증강 생성)", level: 9, category: "ai-dev" },
  { slug: "ai-agent", title: "AI 에이전트", level: 9, category: "ai-dev" },
  { slug: "mcp", title: "MCP(Model Context Protocol)", level: 9, category: "ai-dev" },
  { slug: "streaming-ui", title: "AI 응답 스트리밍 UI", level: 9, category: "ai-dev" },
  { slug: "ai-evaluation", title: "LLM 응답 평가", level: 9, category: "ai-dev" },
  { slug: "hallucination", title: "AI 환각과 대응", level: 9, category: "ai-dev" },
];
