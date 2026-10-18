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

/** 하루 뉴스 분량. */
// 개수·지역 할당보다 근거 확보가 우선이다. 근거가 없으면 발행 자체를 중단한다.
export const NEWS_PER_DAY = { min: 1, max: 5, default: 3 } as const;

/** IT 상식 하루 개수. 스키마가 허용하는 최대(2)와 같다. */
export const TECH_CONCEPTS_PER_DAY = 2;

/** IT 파트 하루 뉴스 분량. 경제 파트와 같이 근거가 부족하면 줄여서 낸다. */
export const TECH_NEWS_PER_DAY = { min: 1, max: 3, default: 3 } as const;

/** 지면 맨 위에 거는 오늘의 키워드 개수. 한눈에 훑는 자리라 짧게 유지한다. */
export const TODAY_KEYWORDS_PER_DAY = { min: 3, max: 5 } as const;

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
 * IT 파트의 발행 하한선. 개발 소식(릴리스 노트·공식 블로그)은 주 단위로 나오고
 * 하루 이틀 늦게 보도되므로 경제 파트보다 넓게 잡는다.
 */
export const TECH_SOURCE_MAX_AGE_HOURS = 168;

/** STEP 1에서 수집할 뉴스 후보 개수. */
export const NEWS_CANDIDATE_COUNT = { min: 6, max: 10 } as const;

/** IT 파트 STEP 1 후보 개수. 3개를 내려면 근거 단계에서 탈락할 몫까지 모아야 한다. */
export const TECH_NEWS_CANDIDATE_COUNT = { min: 6, max: 10 } as const;

/**
 * 뉴스 출처 선호 매체. (명세 §17)
 * 독자가 한국 증권시장 기준으로 읽으므로 국내 경제지를 우선한다.
 * 화이트리스트가 아니라 '가급적 이 안에서 고르라'는 우선순위다.
 */
export const PREFERRED_PUBLISHERS = {
  /** 1순위. 국내·글로벌 이슈 모두 이 매체들의 보도를 먼저 찾는다. 경제지 중심이다. */
  kr: [
    "연합뉴스",
    "한국경제",
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
