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
 * 오늘의 주요 이슈는 정해진 세 자리(슬롯)에 한 건씩 싣는다. 배열 순서가 곧 지면 순서(rank)다.
 *   top      오늘의 화제. 분야와 상관없이 여러 매체가 같은 날 크게 다룬 사건
 *   domestic 국내 정세. region KR, 분류가 DOMESTIC_NEWS_CATEGORIES 중 하나(국내 정치·정책·외교·안보·경제·금융·기업)
 *   it       IT. 분류가 IT_NEWS_CATEGORIES 중 하나
 * 세 슬롯은 서로 다른 사건이어야 한다. 근거 있는 기사로 채우지 못한 슬롯은 비워 두고, 다른 분야로 대신 채우지 않는다.
 */
export const NEWS_SLOTS = ["top", "domestic", "it"] as const;

/** it 슬롯에 들어갈 수 있는 분류. domestic 슬롯에는 들어갈 수 없다. */
export const IT_NEWS_CATEGORIES = ["ai", "semiconductor", "software", "platform", "security"] as const;

/**
 * domestic 슬롯에 들어갈 수 있는 분류. 정치·정책·외교·안보·경제·금융·기업이다.
 * 사회(society)·과학(science)·국제 일반(world)·기타(other)와 IT 분류는 들어갈 수 없다. 이런 사건은 화제(top)로만 싣는다.
 */
export const DOMESTIC_NEWS_CATEGORIES = [
  "politics", "policy", "geopolitics", "rates", "stocks", "fx", "macro", "industry", "commodities",
] as const;

/** 슬롯에 맞는 후보를 본문으로 확인하지 못했을 때 다시 훑을 수집 섹션. 국내 정세의 외교·안보는 수집 프롬프트가 world 섹션으로 보낸다. */
export const NEWS_SLOT_SECTIONS = {
  top: ["politics", "world", "society", "economy", "tech"],
  domestic: ["politics", "world", "economy"],
  it: ["tech"],
} as const;

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
 * IT 뉴스의 발행 하한선. 뉴스는 경제·시사와 같이 최대 72시간까지만 허용한다.
 * 주 단위로 나오는 릴리스 노트·아티클은 뉴스가 아니라 테크 상식의 '더 알아보기'로 다룬다.
 */
export const TECH_SOURCE_MAX_AGE_HOURS = 72;

/** STEP 1에서 수집할 뉴스 후보 개수. */
export const NEWS_CANDIDATE_COUNT = { min: 10, max: 15 } as const;

/** 본문을 직접 읽어 근거를 확인할 후보 수 상한. 수집 시간과 비용의 균형점이다. */
export const NEWS_GROUND_LIMIT = 12;

/**
 * 근거 확인 자리를 슬롯마다 먼저 이만큼 잡은 뒤 나머지를 중요도 순으로 채운다.
 * 중요도로만 자르면 국내·IT 후보가 통째로 빠질 수 있다. 본문 접근 실패에 대비해 하나보다 넉넉히 둔다.
 */
export const NEWS_GROUND_PER_SLOT = 3;

/** 테크 상식 발굴: 그날 검색으로 찾는 최근 기술 글 후보 수와 허용 기간. 커리큘럼·아티클 후보와 함께 큐레이터가 본다. */
export const TECH_DISCOVERY_COUNT = { min: 4, max: 8 } as const;
export const TECH_DISCOVERY_MAX_AGE_DAYS = 14;

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

/** IT 파트 출처 선호 매체. 경제 파트와 같은 우선순위 규칙이다. */
export const PREFERRED_TECH_PUBLISHERS = {
  // 서버가 본문과 게시일을 실제로 읽을 수 있는 매체만 둔다. (2026-10-17 수집 점검)
  // The Verge는 유료 표시, openai.com·axios.com은 자동 수집 차단이라 근거로 쓸 수 없다.
  kr: ["ZDNet Korea", "블로터", "아이뉴스24", "디지털데일리", "전자신문"],
  global: ["InfoQ", "The Register", "Ars Technica", "TechCrunch", "Reuters"],
  /** 릴리스 노트·공식 블로그. 프레임워크·도구 소식은 원문이 가장 정확하다. */
  official: [
    "React 블로그",
    "Next.js·Vercel 블로그",
    "Chrome for Developers",
    "GitHub 블로그",
    "TypeScript 블로그",
    "Anthropic",
    "OpenAI",
    "Google",
    "Microsoft",
  ],
} as const;

/**
 * 자동 수집을 막아(HTTP 403) 서버가 본문을 읽을 수 없는 사이트. 근거로 쓸 수 없으므로 검색 단계에서 피하게 한다.
 * (2026-10-18 생성 로그 기준)
 */
export const UNREADABLE_SOURCES = [
  "apnews.com",
  "axios.com",
  "investing.com",
  "marketscreener.com",
  "openai.com",
  "theverge.com",
  "imf.org",
  // 로컬에서는 열리지만 배포 서버(Vercel)에서는 403을 돌려준다 (2026-10-18 점검)
  "hankyung.com",
  // 유료 기사 표시
  "lemonde.fr",
] as const;

/**
 * MVP는 다중 사용자를 대상으로 하지 않는다.
 * 하나의 고정 프로필을 기준으로 콘텐츠를 생성한다.
 */
export const USER_PROFILE = {
  goal: "증권사 취업 및 면접 대비",
  financeLevel: "beginner",
  locale: "ko-KR",
  timezone: SERVICE_TIMEZONE,
  preferredLength: "concise",
  newsGoal: "요즘 기업·트렌드·시장 등락 흐름을 파악",
  techGoal: "개발·AI 쪽 흐름을 따라가고 프론트엔드 실무 지식을 원리부터 다지기",
  techLevel: "프론트엔드 개발자 (React·TypeScript)",
} as const;
