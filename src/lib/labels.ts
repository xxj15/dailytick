import type { NewsCategory, NewsRegion } from "@/types/briefing";

/** 지면에 노출되는 라벨. enum 값을 그대로 보여주지 않는다. */
export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  rates: "Rates",
  stocks: "Stocks",
  fx: "FX",
  macro: "Macro",
  industry: "Industry",
  policy: "Policy",
  geopolitics: "Geopolitics",
  commodities: "Commodities",
  other: "Market",
};

export const NEWS_REGION_LABEL: Record<NewsRegion, string> = {
  KR: "Korea",
  GLOBAL: "Global",
};
