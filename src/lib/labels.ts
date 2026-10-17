import type { NewsCategory, NewsRegion } from "@/types/briefing";

/** 지면에 노출되는 라벨. enum 값을 그대로 보여주지 않는다. */
export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  rates: "금리",
  stocks: "증시",
  fx: "환율",
  macro: "경제",
  industry: "산업",
  policy: "정책",
  geopolitics: "지정학",
  commodities: "원자재",
  politics: "정치",
  society: "사회",
  world: "국제",
  ai: "AI",
  semiconductor: "반도체",
  software: "소프트웨어",
  platform: "플랫폼",
  security: "보안",
  other: "기타",
};

export const NEWS_REGION_LABEL: Record<NewsRegion, string> = {
  KR: "국내",
  GLOBAL: "해외",
};

/** 상식 카테고리. 커리큘럼 slug를 지면에 그대로 내보내지 않는다. 모르는 값은 그대로 둔다. */
export const KNOWLEDGE_CATEGORY_LABEL: Record<string, string> = {
  // 경제 커리큘럼
  "market-basics": "시장 기초",
  "corporate-value": "기업 가치",
  "rates-bonds": "금리·채권",
  macro: "거시경제",
  products: "금융상품",
  "securities-business": "증권업",
  risk: "리스크",
  "financial-statements": "재무제표",
  "market-structure": "시장 구조",
  "global-markets": "글로벌 시장",
  // IT 커리큘럼
  internet: "인터넷의 원리",
  browser: "브라우저",
  javascript: "자바스크립트",
  css: "CSS",
  react: "React",
  performance: "성능",
  security: "보안",
  infra: "인프라",
  data: "데이터",
  ai: "AI",
  "dev-life": "개발 문화",
};
