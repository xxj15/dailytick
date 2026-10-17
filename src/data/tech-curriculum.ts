import type { Concept } from "@/data/curriculum";

/**
 * IT 개념 Curriculum.
 *
 * 경제 커리큘럼과 같은 규칙을 따른다. AI가 주제를 고르지 않고 이 배열 순서대로 나간다.
 * 독자는 현업 프론트엔드 개발자지만, 출퇴근길에 가볍게 읽는 자리다.
 * 교과서 목차 대신 "어, 그거 왜 그렇지?" 싶은 질문으로 제목을 단다.
 * 쉬운 질문에서 시작해 브라우저 → JS → CSS → React → 성능·보안 → 인프라 → AI로 깊어진다.
 */

export type TechCurriculumCategory =
  | "internet"
  | "browser"
  | "javascript"
  | "css"
  | "react"
  | "performance"
  | "security"
  | "infra"
  | "data"
  | "ai"
  | "dev-life";

export type TechCurriculumConcept = Concept & { category: TechCurriculumCategory };

export const TECH_CURRICULUM: TechCurriculumConcept[] = [
  // LEVEL 1 — 매일 보지만 신기한 것들
  { slug: "q-url-enter", title: "주소창에 URL을 치고 엔터를 누르면 생기는 일", level: 1, category: "internet" },
  { slug: "q-dns", title: "DNS: 인터넷은 주소를 어떻게 찾아갈까", level: 1, category: "internet" },
  { slug: "q-https-lock", title: "주소창 자물쇠는 정확히 뭘 지켜줄까", level: 1, category: "internet" },
  { slug: "q-refresh-old-page", title: "새로고침했는데 왜 옛날 화면이 보일까", level: 1, category: "browser" },
  { slug: "q-cookie-banner", title: "사이트마다 '쿠키 허용' 창이 뜨는 이유", level: 1, category: "browser" },
  { slug: "q-emoji", title: "이모지는 어떻게 화면에 그려질까", level: 1, category: "internet" },
  { slug: "q-hangul-broken", title: "한글이 '뷁'처럼 깨지는 이유", level: 1, category: "internet" },
  { slug: "q-zero-point-one", title: "0.1 + 0.2가 0.3이 아닌 이유", level: 1, category: "javascript" },

  // LEVEL 2 — 브라우저 속사정
  { slug: "q-tabs-memory", title: "탭을 많이 열면 왜 컴퓨터가 버벅일까", level: 2, category: "browser" },
  { slug: "q-60fps", title: "화면이 '버벅'인다는 건 정확히 무슨 뜻일까", level: 2, category: "browser" },
  { slug: "q-font-flash", title: "웹폰트가 늦게 뜨면서 글자가 번쩍이는 이유", level: 2, category: "browser" },
  { slug: "q-blurry-image", title: "이미지가 흐릿하다가 선명해지는 사이트의 비밀", level: 2, category: "performance" },
  { slug: "q-offline-web", title: "인터넷이 끊겨도 열리는 웹사이트", level: 2, category: "browser" },
  { slug: "q-pwa", title: "웹사이트를 앱처럼 홈 화면에 설치하는 법", level: 2, category: "browser" },
  { slug: "q-mobile-100vh", title: "모바일에서 100vh가 이상하게 동작하는 이유", level: 2, category: "css" },

  // LEVEL 3 — 자바스크립트의 수상한 점
  { slug: "q-single-thread", title: "JS는 한 번에 하나만 하는데 어떻게 동시에 여러 일을 할까", level: 3, category: "javascript" },
  { slug: "q-settimeout-zero", title: "setTimeout(fn, 0)이 바로 실행되지 않는 이유", level: 3, category: "javascript" },
  { slug: "q-closure-loop", title: "반복문 안 클릭 핸들러가 전부 마지막 값을 찍는 이유", level: 3, category: "javascript" },
  { slug: "q-this-lost", title: "this가 갑자기 undefined가 되는 순간", level: 3, category: "javascript" },
  { slug: "q-npm-install", title: "npm install을 누르면 무슨 일이 일어날까", level: 3, category: "dev-life" },
  { slug: "q-node-modules", title: "node_modules는 왜 그렇게 무거울까", level: 3, category: "dev-life" },
  { slug: "q-timezone", title: "날짜·시간 처리가 개발자의 악몽인 이유", level: 3, category: "javascript" },
  { slug: "q-why-typescript", title: "타입스크립트를 쓰면 정말 버그가 줄어들까", level: 3, category: "javascript" },

  // LEVEL 4 — CSS 미스터리
  { slug: "q-zindex", title: "z-index를 9999로 줘도 안 올라오는 이유", level: 4, category: "css" },
  { slug: "q-flex-grid", title: "flex와 grid, 언제 뭘 써야 할까", level: 4, category: "css" },
  { slug: "q-css-hard", title: "CSS가 유독 어렵게 느껴지는 이유", level: 4, category: "css" },
  { slug: "q-dark-mode", title: "다크 모드는 어떻게 만들까", level: 4, category: "css" },
  { slug: "q-animation-smooth", title: "어떤 애니메이션은 부드럽고 어떤 건 끊길까", level: 4, category: "css" },

  // LEVEL 5 — React와 렌더링 전략
  { slug: "q-react-rerender", title: "React는 왜 화면을 자꾸 다시 그릴까", level: 5, category: "react" },
  { slug: "q-effect-twice", title: "useEffect가 두 번 실행되는 이유", level: 5, category: "react" },
  { slug: "q-key-prop", title: "리스트에 key를 꼭 넣으라는 이유", level: 5, category: "react" },
  { slug: "q-where-render", title: "화면은 어디서 그려질까: CSR과 SSR", level: 5, category: "react", pairWith: "q-hydration" },
  { slug: "q-hydration", title: "하이드레이션: 그려진 화면에 생명을 불어넣기", level: 5, category: "react" },
  { slug: "q-static-site", title: "블로그는 왜 미리 만들어 두면 빠를까 (SSG·ISR)", level: 5, category: "react" },
  { slug: "q-server-components", title: "서버 컴포넌트는 뭐가 그렇게 다를까", level: 5, category: "react" },
  { slug: "q-state-where", title: "상태는 어디에 둬야 할까: 로컬·전역·서버 상태", level: 5, category: "react" },

  // LEVEL 6 — 빠른 사이트의 비밀
  { slug: "q-lighthouse", title: "Lighthouse 점수는 뭘 보고 매기는 걸까", level: 6, category: "performance" },
  { slug: "q-tree-shaking", title: "안 쓰는 코드는 어떻게 털어낼까 (트리 셰이킹)", level: 6, category: "performance" },
  { slug: "q-lazy-loading", title: "필요할 때만 불러오기: 코드 스플리팅과 지연 로딩", level: 6, category: "performance" },
  { slug: "q-infinite-scroll", title: "무한 스크롤은 어떻게 만들까", level: 6, category: "performance" },
  { slug: "q-skeleton", title: "로딩 스피너 vs 스켈레톤, 뭐가 더 빠르게 느껴질까", level: 6, category: "performance" },
  { slug: "q-debounce", title: "검색창이 글자마다 요청을 보내지 않는 비결", level: 6, category: "performance" },

  // LEVEL 7 — 해킹과 로그인
  { slug: "q-cors-error", title: "CORS 에러는 왜 나를 괴롭힐까", level: 7, category: "security" },
  { slug: "q-stay-logged-in", title: "로그인은 어떻게 유지될까: 세션과 토큰", level: 7, category: "security" },
  { slug: "q-google-login", title: "'구글로 로그인'의 원리 (OAuth)", level: 7, category: "security" },
  { slug: "q-password-storage", title: "비밀번호는 서버에 어떻게 저장될까", level: 7, category: "security" },
  { slug: "q-xss", title: "댓글 하나로 사이트를 해킹하는 법 (XSS)", level: 7, category: "security" },
  { slug: "q-captcha", title: "캡차는 사람과 봇을 어떻게 구분할까", level: 7, category: "security" },
  { slug: "q-npm-attack", title: "npm 패키지 하나로 회사가 털리는 이유", level: 7, category: "security" },

  // LEVEL 8 — 서비스가 돌아가는 곳
  { slug: "q-cdn", title: "전 세계 어디서나 빠른 사이트의 비결 (CDN)", level: 8, category: "infra" },
  { slug: "q-serverless", title: "서버리스는 정말 서버가 없을까", level: 8, category: "infra" },
  { slug: "q-docker", title: "'내 컴퓨터에선 되는데'를 없애는 도커", level: 8, category: "infra" },
  { slug: "q-preview-deploy", title: "PR마다 미리보기 사이트가 생기는 원리", level: 8, category: "infra" },
  { slug: "q-realtime-chat", title: "카톡 메시지는 어떻게 실시간으로 올까", level: 8, category: "data" },
  { slug: "q-youtube-stream", title: "유튜브는 어떻게 끊김 없이 영상을 보여줄까", level: 8, category: "data" },
  { slug: "q-map-zoom", title: "지도 앱은 어떻게 부드럽게 확대될까", level: 8, category: "data" },
  { slug: "q-git-time-travel", title: "Git은 어떻게 과거로 돌아갈까", level: 8, category: "dev-life" },

  // LEVEL 9 — AI랑 같이 일하기
  { slug: "q-chatgpt-typing", title: "AI 답변은 왜 한 글자씩 타자 치듯 나올까", level: 9, category: "ai" },
  { slug: "q-tokens", title: "토큰: AI가 글자를 세는 방법", level: 9, category: "ai" },
  { slug: "q-ai-lies", title: "AI는 왜 가끔 그럴듯한 거짓말을 할까", level: 9, category: "ai" },
  { slug: "q-prompt-matters", title: "프롬프트 한 줄로 결과가 달라지는 이유", level: 9, category: "ai" },
  { slug: "q-ai-reads-code", title: "AI 코딩 도구는 내 코드를 어떻게 이해할까", level: 9, category: "ai" },
  { slug: "q-vector-search", title: "말뜻이 비슷한 글을 찾는 법 (벡터 검색)", level: 9, category: "ai", pairWith: "q-rag" },
  { slug: "q-rag", title: "AI에게 커닝 페이퍼 쥐여주기 (RAG)", level: 9, category: "ai" },
  { slug: "q-mcp", title: "MCP: AI에게 손발을 달아주는 표준", level: 9, category: "ai" },
  { slug: "q-ai-agent", title: "AI 에이전트는 챗봇과 뭐가 다를까", level: 9, category: "ai" },
];
