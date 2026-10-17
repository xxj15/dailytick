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
