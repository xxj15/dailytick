/**
 * 서비스 전역 상수.
 * 서비스명은 추후 변경 가능하므로 반드시 이 상수를 통해 참조한다.
 */
export const APP_NAME = "MARKET PAPER";
export const APP_TAGLINE = "DAILY FINANCIAL BRIEFING";
export const APP_DESCRIPTION =
  "증권사 취준생을 위한 개인화 데일리 금융 학습 서비스";

/** 모든 서비스 날짜 판단의 기준 시간대. 서버 timezone을 신뢰하지 않는다. */
export const SERVICE_TIMEZONE = "Asia/Seoul";

/** 목표 발행 시각 (KST). */
export const PUBLISH_HOUR_KST = 8;
export const PUBLISH_MINUTE_KST = 30;

/** 창간일. Issue Number 계산 기준. */
export const FIRST_ISSUE_DATE = "2026-08-25";

/** 하루 콘텐츠 분량. */
export const KNOWLEDGE_PER_DAY = { min: 1, max: 2 } as const;
export const NEWS_PER_DAY = { min: 3, max: 5, default: 3 } as const;

/** STEP 1에서 수집할 뉴스 후보 개수. */
export const NEWS_CANDIDATE_COUNT = { min: 6, max: 10 } as const;

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
  newsGoal: "경제신문을 읽지 않아도 주요 1면급 경제 이슈를 파악",
} as const;
