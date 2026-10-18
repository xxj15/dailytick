import type { TechCurriculumCategory } from "@/data/tech-curriculum";

/**
 * 테크 상식 아티클 라이브러리.
 *
 * 오래됐어도 지금 읽을 가치가 있는 글만 둔다. 사람이 고르고, 서버가 본문을 실제로 읽을 수 있는지
 * 확인한 글이다 (2026-10-18 점검). 발행 날 서버가 원문을 다시 읽고 근거 문장을 대조한 뒤에만 요약한다.
 *
 * slug는 학습 이력으로 남는다. 한 번 정하면 바꾸지 않는다.
 */
export type TechArticle = {
  slug: string;
  /** 지면에 거는 한국어 제목. 원문 제목을 그대로 옮기지 않고 무엇을 배우는 글인지 드러낸다. */
  title: string;
  url: string;
  publisher: string;
  category: TechCurriculumCategory;
  /** 1 입문 ~ 5 심화 */
  level: number;
  /** 큐레이터가 고를 때 참고하는 한 줄. 이 글에서 무엇을 배울 수 있는가. */
  takeaway: string;
};

export const TECH_ARTICLES: TechArticle[] = [
  // CS · 시스템 설계
  { slug: "a-discord-messages", title: "Discord는 메시지 수조 개를 어떻게 저장할까", url: "https://discord.com/blog/how-discord-stores-trillions-of-messages", publisher: "Discord", category: "cs", level: 4,
    takeaway: "Cassandra→ScyllaDB 이전, 핫 파티션을 요청 병합과 일관 해싱으로 푼 실제 수치" },
  { slug: "a-figma-multiplayer", title: "Figma 동시 편집은 어떻게 충돌을 피할까", url: "https://www.figma.com/blog/how-figmas-multiplayer-technology-works/", publisher: "Figma", category: "cs", level: 4,
    takeaway: "CRDT를 그대로 쓰지 않고 서버 중심으로 단순화한 실시간 협업 설계" },
  { slug: "a-stripe-idempotency", title: "결제 API는 왜 같은 요청을 두 번 받아도 안전할까 (멱등성)", url: "https://stripe.com/blog/idempotency", publisher: "Stripe", category: "cs", level: 3,
    takeaway: "재시도·네트워크 실패 속에서 멱등 키로 중복 처리를 막는 API 설계" },
  { slug: "a-cloudflare-pingora", title: "Cloudflare는 왜 Nginx를 버리고 프록시를 직접 만들었을까", url: "https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/", publisher: "Cloudflare", category: "cs", level: 4,
    takeaway: "커넥션 재사용 한계, Rust로 다시 짠 프록시가 CPU·메모리를 줄인 이유" },
  { slug: "a-cloudflare-quic", title: "QUIC과 HTTP/3는 TCP의 어떤 문제를 풀었을까", url: "https://blog.cloudflare.com/the-road-to-quic/", publisher: "Cloudflare", category: "cs", level: 3,
    takeaway: "헤드 오브 라인 블로킹과 핸드셰이크 지연을 UDP 위에서 해결한 방식" },
  { slug: "a-slack-shared-channels", title: "Slack은 회사 간 공유 채널을 어떻게 만들었을까", url: "https://slack.engineering/how-slack-built-shared-channels/", publisher: "Slack Engineering", category: "cs", level: 4,
    takeaway: "워크스페이스 단위로 나뉜 데이터 모델을 바꾸지 않고 채널을 공유한 설계" },

  // 프론트엔드
  { slug: "a-why-react-rerenders", title: "React는 정확히 언제 다시 렌더링할까", url: "https://www.joshwcomeau.com/react/why-react-re-renders/", publisher: "Josh W. Comeau", category: "frontend", level: 2,
    takeaway: "props가 바뀌어서가 아니라 부모가 렌더링돼서라는 흔한 오해와 memo의 실제 역할" },
  { slug: "a-complete-guide-useeffect", title: "useEffect를 '생명주기'가 아니라 '동기화'로 보기", url: "https://overreacted.io/a-complete-guide-to-useeffect/", publisher: "overreacted (Dan Abramov)", category: "frontend", level: 3,
    takeaway: "렌더마다 고유한 props·state, 의존성 배열을 속이면 생기는 버그" },
  { slug: "a-two-reacts", title: "서버 React와 클라이언트 React, 두 개의 React", url: "https://overreacted.io/the-two-reacts/", publisher: "overreacted (Dan Abramov)", category: "frontend", level: 4,
    takeaway: "UI를 데이터의 함수이자 상태의 함수로 보는 두 관점과 서버 컴포넌트의 동기" },
  { slug: "a-making-sense-rsc", title: "React 서버 컴포넌트를 그림으로 이해하기", url: "https://www.joshwcomeau.com/react/server-components/", publisher: "Josh W. Comeau", category: "frontend", level: 3,
    takeaway: "서버 컴포넌트·클라이언트 경계·'use client'가 실제로 무엇을 바꾸는지" },
  { slug: "a-state-management-kcd", title: "상태 관리 라이브러리 없이 React 앱 상태를 나누는 법", url: "https://kentcdodds.com/blog/application-state-management-with-react", publisher: "Kent C. Dodds", category: "frontend", level: 3,
    takeaway: "상태를 쓰는 곳 가까이 두고, 서버 캐시와 UI 상태를 분리하기" },
  { slug: "a-practical-react-query", title: "React Query를 실무에서 잘 쓰는 법", url: "https://tkdodo.eu/blog/practical-react-query", publisher: "TkDodo", category: "frontend", level: 3,
    takeaway: "서버 상태와 클라이언트 상태를 섞지 않기, staleTime·쿼리 키 설계" },
  { slug: "a-dont-overuse-state", title: "useState를 덜 쓰면 버그가 줄어든다", url: "https://tkdodo.eu/blog/dont-over-use-state", publisher: "TkDodo", category: "frontend", level: 2,
    takeaway: "파생 가능한 값을 상태로 들고 있지 않기, 동기화 버그를 없애는 습관" },
  { slug: "a-optimize-inp", title: "클릭했는데 반응이 늦다: INP 최적화", url: "https://web.dev/articles/optimize-inp", publisher: "web.dev", category: "frontend", level: 3,
    takeaway: "입력 지연·처리 시간·표시 지연으로 나눠 상호작용 응답성을 개선하는 법" },
  { slug: "a-rendering-on-the-web", title: "웹 렌더링 전략 총정리: SSR·SSG·CSR·하이드레이션", url: "https://web.dev/articles/rendering-on-the-web", publisher: "web.dev", category: "frontend", level: 3,
    takeaway: "렌더링 방식별 TTFB·FCP·TTI 트레이드오프와 선택 기준" },
  { slug: "a-cost-of-javascript", title: "JavaScript는 왜 같은 용량의 이미지보다 비쌀까", url: "https://v8.dev/blog/cost-of-javascript-2019", publisher: "V8", category: "frontend", level: 3,
    takeaway: "다운로드보다 파싱·컴파일·실행이 비싼 이유와 번들 크기 예산" },
  { slug: "a-flexbox-guide", title: "flexbox를 감이 아니라 원리로 이해하기", url: "https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/", publisher: "Josh W. Comeau", category: "frontend", level: 2,
    takeaway: "flex-grow·shrink·basis가 공간을 나누는 실제 계산" },
  { slug: "a-toss-esm-packages", title: "토스뱅크는 왜 사내 패키지를 ESM으로만 내기로 했을까", url: "https://toss.tech/article/package-management-1", publisher: "토스 기술 블로그", category: "frontend", level: 3,
    takeaway: "CJS·ESM 동시 지원의 비용과 ESM 전용으로 바꾸며 얻은 것" },

  // AI
  { slug: "a-building-effective-agents", title: "좋은 AI 에이전트는 생각보다 단순하다", url: "https://www.anthropic.com/engineering/building-effective-agents", publisher: "Anthropic", category: "ai", level: 3,
    takeaway: "워크플로와 에이전트의 차이, 프롬프트 체이닝·라우팅·오케스트레이터 패턴" },
  { slug: "a-context-engineering", title: "프롬프트 엔지니어링 다음은 컨텍스트 엔지니어링", url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents", publisher: "Anthropic", category: "ai", level: 4,
    takeaway: "한정된 컨텍스트에 무엇을 넣고 뺄지, 긴 작업에서 기억을 관리하는 법" },
  { slug: "a-llm-agents-lilian", title: "LLM 에이전트의 구성 요소: 계획·기억·도구", url: "https://lilianweng.github.io/posts/2023-06-23-agent/", publisher: "Lil'Log", category: "ai", level: 4,
    takeaway: "에이전트를 계획·메모리·도구 사용으로 나눠 보는 기본 틀" },
  { slug: "a-reward-hacking", title: "AI는 왜 시험의 허점을 파고들까 (보상 해킹)", url: "https://lilianweng.github.io/posts/2024-11-28-reward-hacking/", publisher: "Lil'Log", category: "ai", level: 5,
    takeaway: "보상 해킹의 유형과 RLHF·코딩 에이전트에서 실제로 나타나는 사례" },
  { slug: "a-genai-platform", title: "생성형 AI 서비스의 뼈대: 가드레일·캐시·라우터", url: "https://huyenchip.com/2024/07/25/genai-platform.html", publisher: "Chip Huyen", category: "ai", level: 4,
    takeaway: "모델 호출 앞뒤에 붙는 컨텍스트 보강·가드레일·캐시·관측 구성 요소" },
  { slug: "a-toss-benchmark", title: "리더보드 1등 LLM이 우리 서비스에서도 1등일까", url: "https://toss.tech/article/toss-benchmark", publisher: "토스 기술 블로그", category: "ai", level: 3,
    takeaway: "공개 벤치마크 대신 서비스에 맞는 평가셋을 직접 만든 과정" },
  { slug: "a-toss-ai-platform", title: "서비스 개발자가 AI 기능에만 집중하게 만드는 플랫폼", url: "https://toss.tech/article/ai-platform-foundation", publisher: "토스 기술 블로그", category: "ai", level: 3,
    takeaway: "모델 게이트웨이·프롬프트 관리·평가를 플랫폼으로 묶은 사내 사례" },
];
