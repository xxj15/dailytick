/**
 * 서비스 전역 상수.
 * 서비스명은 추후 변경 가능하므로 반드시 이 상수를 통해 참조한다.
 */
export const APP_NAME = "Daily Tick";
export const APP_TAGLINE = "Daily Finance & Tech Briefing";
export const APP_DESCRIPTION =
  "증권사 취준생을 위한 개인화 데일리 금융 학습 서비스";

/** 모든 서비스 날짜 판단의 기준 시간대. 서버 timezone을 신뢰하지 않는다. */
export const SERVICE_TIMEZONE = "Asia/Seoul";

/** 목표 발행 시각 (KST). */
export const PUBLISH_HOUR_KST = 8;
export const PUBLISH_MINUTE_KST = 30;

/** 창간일. Issue Number 계산 기준. */
export const FIRST_ISSUE_DATE = "2026-08-25";

/**
 * 오늘의 주요 이슈는 정해진 세 자리(슬롯)에 한 건씩 싣는다. 배열 순서가 곧 지면 순서(rank)다. (2026-10-20 사용자 결정. 같은 날 화제 → 주요 시사로 바꿨다)
 *   top      주요 시사. 사회·정책·국제 정세 가운데 파급력이 크고 알아둘 가치가 있는 사건. 경제·IT 분류는 들어갈 수 없다
 *   economy  경제. 분류가 ECONOMY_NEWS_CATEGORIES 중 하나(증시·금리·환율·경기·산업·기업·경제정책). 국내·해외 모두 된다
 *   it       IT. 분류가 IT_NEWS_CATEGORIES 중 하나. 기술·제품·서비스 소식이다. IT 기업이어도 실적·주가 기사는 경제다
 * 세 슬롯은 서로 다른 사건이어야 한다. 근거 있는 기사로 채우지 못한 슬롯은 비워 두고, 다른 분야로 대신 채우지 않는다.
 */
export const NEWS_SLOTS = ["top", "economy", "it"] as const;

/** 지금은 쓰지 않는 슬롯. 2026-10-19~20에 저장된 기사에 남아 있어 읽을 때만 받는다. domestic은 국내 정세였다. */
export const LEGACY_NEWS_SLOTS = ["domestic"] as const;

/** it 슬롯에 들어갈 수 있는 분류. economy 슬롯에는 들어갈 수 없다. */
export const IT_NEWS_CATEGORIES = ["ai", "semiconductor", "software", "platform", "security"] as const;

/**
 * economy 슬롯에 들어갈 수 있는 분류. 증시·금리·환율·경기·산업·기업·원자재·경제정책이다.
 * 정치(politics)·외교안보(geopolitics)·사회·과학·국제 일반·기타와 IT 분류는 들어갈 수 없다. 이런 사건은 주요 시사(top)로만 싣는다.
 */
export const ECONOMY_NEWS_CATEGORIES = [
  "rates", "stocks", "fx", "macro", "industry", "commodities", "policy",
] as const;

/**
 * 하루 뉴스 분량. 슬롯 수가 최대다. 근거가 없으면 슬롯을 비우고, 하나도 없으면 발행 자체를 중단한다.
 * 최대 건수는 슬롯 고유성 검사(verify.ts)가 지킨다. 저장 스키마의 상한은 트림을 위해 더 넉넉하다.
 */
export const NEWS_PER_DAY = { min: 1, max: NEWS_SLOTS.length } as const;

/**
 * 하루 상식 개수. 짝 개념은 붙이지 않는다.
 * 테크 상식은 서로 다른 개념 두 개(가능하면 서로 다른 분야)를, 경제 상식은 하나를 깊게 읽는다.
 * 테크 상식은 검증을 통과한 추천이 모자라면 빈 자리를 검증된 커리큘럼 개념(커리큘럼을 다 돌았으면 복습 개념)으로 채운다.
 * 그보다 적게 내는 것은 생성 실패(줄여 다시 쓴 경우)·테크 기한·빈 커리큘럼 때뿐이다.
 */
export const TECH_CONCEPTS_PER_DAY = 2;
export const ECONOMY_CONCEPTS_PER_DAY = 1;

/** IT 파트 하루 뉴스 분량. 경제 파트와 같이 근거가 부족하면 줄여서 낸다. */
export const TECH_NEWS_PER_DAY = { min: 1, max: 3, default: 2 } as const;

/**
 * 지면 맨 위에 거는 오늘의 키워드 개수. 한눈에 훑는 자리라 짧게 유지한다.
 * 보통 3~5개지만 기사가 1~2건인 날(빈 슬롯·검토 제외)은 더 적을 수 있다. 키워드 개수 때문에 그날 지면을 버리지 않도록 하한은 1이다.
 */
export const TODAY_KEYWORDS_PER_DAY = { min: 1, max: 5 } as const;

/**
 * 출처 게시 시각의 발행 하한선. 기준일 자정에서 이만큼 거슬러 올라간다.
 * 뉴스마다 이 범위 안에 든 출처가 최소 하나는 있어야 발행한다. (명세 §12)
 *
 * 24시간 우선·48시간 확대라는 우선순위는 프롬프트가 유도한다.
 * 이 상수는 그보다 느슨한 '명백히 오래된 근거'의 경계다.
 * 월요일 지면은 금요일 장 마감 뒤 보도를 근거로 쓰므로 72시간이어야 한다.
 */
export const SOURCE_MAX_AGE_HOURS = 72;

/**
 * 주요 이슈 후보를 모으는 국내 언론 RSS. (2026-10-20 웹 검색을 대신한다. 웹 검색 비용이 지면 생성 비용의 대부분이었다)
 * 서버가 기사 본문과 게시 시각을 실제로 읽을 수 있는 매체만 둔다(2026-10-20 로컬 점검).
 * 조선일보 본지는 본문을 못 읽어, 한겨레는 피드에 게시 시각이 없고 AI 활용 금지를 밝혀 뺐다.
 * section은 고르기 프롬프트에 붙이는 참고 표시다. 들어갈 슬롯은 고른 후보의 category로 정한다.
 */
export const NEWS_FEEDS = [
  { publisher: "연합뉴스", section: "종합", url: "https://www.yna.co.kr/rss/news.xml" },
  { publisher: "동아일보", section: "종합", url: "https://rss.donga.com/total.xml" },
  { publisher: "경향신문", section: "종합", url: "https://www.khan.co.kr/rss/rssdata/total_news.xml" },
  { publisher: "뉴데일리", section: "종합", url: "https://www.newdaily.co.kr/rss/rss.xml" },
  { publisher: "연합뉴스", section: "경제", url: "https://www.yna.co.kr/rss/economy.xml" },
  { publisher: "매일경제", section: "경제", url: "https://www.mk.co.kr/rss/30000001/" },
  { publisher: "서울경제", section: "경제", url: "https://www.sedaily.com/rss/newsall" },
  { publisher: "머니투데이", section: "경제", url: "https://rss.mt.co.kr/mt_news.xml" },
  { publisher: "조선비즈", section: "경제", url: "https://biz.chosun.com/arc/outboundfeeds/rss/?outputType=xml" },
  { publisher: "전자신문", section: "IT", url: "https://rss.etnews.com/Section901.xml" },
  { publisher: "ZDNet Korea", section: "IT", url: "https://feeds.feedburner.com/zdkorea" },
  { publisher: "아이뉴스24", section: "IT", url: "https://www.inews24.com/rss/news_it.xml" },
  { publisher: "블로터", section: "IT", url: "https://www.bloter.net/rss/allArticle.xml" },
] as const;

/**
 * 피드 하나에서 고르기에 넘기는 최신 기사 수. 제목 한 줄이 입력 토큰 수십 개다.
 * 25건일 때는 연합뉴스·머니투데이처럼 큰 피드가 최근 15~30분 치뿐이라 중요한 기사를 놓쳤다(2026-10-20 측정).
 * 피드 자체가 최근 1~14시간 치만 담으므로 60건이면 대부분 피드의 범위 안 기사를 다 본다. 고르기 입력은 3~4만 토큰이다.
 */
export const NEWS_FEED_ITEMS_PER_FEED = 60;

/** 고르기에 넘기는 기사의 게시 시각 범위. 기준일 전날 0시부터다(isFreshSource 기준). 아침 발행이면 약 32시간이다. */
export const NEWS_FEED_MAX_AGE_HOURS = 24;

/** 고르기에서 슬롯마다 받는 후보 수. 근거 확인은 그중 앞의 NEWS_GROUND_PER_SLOT개를 읽는다. */
export const NEWS_PICKS_PER_SLOT = 3;

/** 기사 고르기 호출의 제한 시간. 웹 검색 없이 제목 목록만 보지만 목록이 600건 안팎이다. */
export const NEWS_SELECT_TIMEOUT_MS = 90_000;

/**
 * 본문을 직접 읽어 근거를 확인할 후보 수 상한. 싣는 기사는 최대 3건이라 슬롯마다 예비 하나씩이면 된다.
 * 읽는 본문이 곧 근거 문장 고르기의 입력 토큰이다. (2026-10-20 비용 절감으로 12 → 6)
 */
export const NEWS_GROUND_LIMIT = 6;

/**
 * 주요 이슈 후보 하나에서 본문을 읽는 기사 수. 읽는 본문이 근거 문장 고르기·검토의 입력 토큰이다.
 * 원인·배경 문장은 필수가 아니므로(있으면 요약에 넣는다) 한 건만 읽는다. 읽히지 않으면 다음 출처를 읽는다.
 */
export const NEWS_DOCS_PER_CANDIDATE = 1;

/**
 * 근거 확인 자리를 슬롯마다 먼저 이만큼 잡은 뒤 나머지를 중요도 순으로 채운다.
 * 중요도로만 자르면 경제·IT 후보가 통째로 빠질 수 있다. 본문 접근 실패에 대비해 하나보다 넉넉히 둔다.
 */
export const NEWS_GROUND_PER_SLOT = 2;

/**
 * OpenAI 단가(USD). gpt-5.6-luna 공식 단가다(2026-10-20 developers.openai.com/api/docs/pricing 확인).
 * OPENAI_MODEL을 바꾸면 함께 고친다. 웹 검색은 지금 쓰지 않지만 이전 생성 로그의 사용액을 셀 때 쓴다.
 */
export const OPENAI_PRICE_USD = { inputPer1M: 0.2, outputPer1M: 1.2, webSearchCall: 0.01 } as const;

/**
 * 수동 실행(force 재생성·dryRun 미리보기)의 월 예산(USD). 이번 달 추정 사용액이 이 값에 닿으면 서버가 수동 실행을 거절한다.
 * 크레딧 $10로 최소 한 달을 버티기 위한 상한이다(2026-10-20 사용자 요청). 나머지는 매일 자동 발행 몫이다(하루 몇 센트).
 * 매일 자동 발행은 막지 않는다.
 */
export const MANUAL_RUN_BUDGET_USD = 5;

/**
 * 뉴스 출처 선호 매체. (명세 §17)
 * 독자가 한국 증권시장 기준으로 읽으므로 국내 경제지를 우선한다.
 * 화이트리스트가 아니라 '가급적 이 안에서 고르라'는 우선순위다.
 */
export const PREFERRED_PUBLISHERS = {
  /** 1순위. 국내·글로벌 이슈 모두 이 매체들의 보도를 먼저 찾는다. 경제지 중심이다. */
  kr: [
    "연합뉴스",
    "매일경제",
    "서울경제",
    "머니투데이",
    "이데일리",
    "조선비즈",
    "중앙일보",
  ],
  global: ["Reuters", "Bloomberg", "CNBC", "Financial Times", "WSJ"],
  /** 수치·발표 원문 확인용. 언제든 우선 인용할 수 있다. */
  official: [
    "한국은행",
    "금융위원회",
    "금융감독원",
    "기획재정부",
    "통계청",
    "대한민국 정책브리핑",
    "국회",
    "Fed",
    "SEC",
  ],
} as const;

/**
 * MVP는 다중 사용자를 대상으로 하지 않는다.
 * 하나의 고정 프로필을 기준으로 콘텐츠를 생성한다.
 */
export const USER_PROFILE = {
  /** 2026-10-20 사용자가 밝힌 목표. 특정 기업 이름은 프롬프트에 넣지 않는다(모든 글이 그 기업으로 쏠린다). */
  goal: "IT 개발·DX/AX 직무 중심 취업 준비 (금융 IT·커머스에도 관심)",
  financeLevel: "beginner",
  locale: "ko-KR",
  timezone: SERVICE_TIMEZONE,
  preferredLength: "concise",
  newsGoal: "중요한 국내외 이슈를 폭넓게 접하고 경제·산업·기술 흐름을 자연스럽게 이해",
  techGoal: "CS·소프트웨어 엔지니어링 기본기와 AI·클라우드 실무(DX/AX)를 원리부터 다지기",
  techLevel: "프론트엔드(React·TypeScript) 경험이 있는 취업 준비 개발자",
} as const;
