import { economyField } from "@/data/curriculum";
import type { NewsCategory, NewsRegion, StoredNewsSlot } from "@/types/briefing";

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
  science: "과학",
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

/** 주요 이슈의 자리. 2026-10-19 이후 기사에만 있다. 국내(domestic)는 2026-10-19~20 기사의 예전 자리다. */
export const NEWS_SLOT_LABEL: Record<StoredNewsSlot, string> = {
  top: "오늘의 화제",
  economy: "경제",
  it: "IT",
  domestic: "국내",
};

/** 상식의 세부 카테고리 칩. 테크는 CS·프론트엔드·백엔드·AI, 경제는 경제·증권으로 보여준다. */
const KNOWLEDGE_FIELD_LABEL: Record<string, string> = { cs: "CS", frontend: "프론트엔드", backend: "백엔드·클라우드", ai: "AI" };

/** 경제 커리큘럼의 세부 분류. 칩 옆에 작게 붙인다. */
const ECONOMY_CATEGORY_LABEL: Record<string, string> = {
  "economy-basics": "경제 기초",
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
  business: "기업 경영",
};

const ECONOMY_FIELD_LABEL = { economy: "경제", securities: "증권", business: "경영" } as const;

export function knowledgeLabel(category: string): { field: string; detail?: string } {
  if (KNOWLEDGE_FIELD_LABEL[category]) return { field: KNOWLEDGE_FIELD_LABEL[category] };
  if (ECONOMY_CATEGORY_LABEL[category]) {
    return { field: ECONOMY_FIELD_LABEL[economyField(category)], detail: ECONOMY_CATEGORY_LABEL[category] };
  }
  // 커리큘럼을 바꾸기 전에 저장된 테크 상식(browser, javascript 등)은 그대로 보여준다
  return { field: category };
}

/** 오늘의 주요 이슈를 나누는 분야. 분류(category)에서 정한다. 수집 단계의 다섯 섹션과 같다. */
export type NewsField = "politics" | "world" | "society" | "economy" | "tech";

export const NEWS_FIELD_LABEL: Record<NewsField, string> = {
  politics: "정치·정책",
  world: "국제",
  society: "사회",
  economy: "경제",
  tech: "IT·과학",
};

const FIELD_BY_CATEGORY: Partial<Record<NewsCategory, NewsField>> = {
  ai: "tech", semiconductor: "tech", software: "tech", platform: "tech", security: "tech", science: "tech",
  politics: "politics", policy: "politics",
  world: "world", geopolitics: "world",
  society: "society",
};

export function newsField(category: NewsCategory): NewsField {
  return FIELD_BY_CATEGORY[category] ?? "economy";
}
