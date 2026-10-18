import { rotateByCategory } from "@/lib/curriculum/rotate";

/**
 * 경제 상식 Curriculum.
 *
 * AI가 매일 마음대로 주제를 고르지 않는다. 출제 순서는 코드가 정한다.
 * 경제(경제 기초·거시·금리·글로벌)와 증권(시장·기업가치·상품·재무 등) 두 갈래를 번갈아 낸다.
 * 각 갈래 안에서는 아래 배열 순서(기초 → 중급)를 따른다.
 *
 * slug는 학습 이력으로 DB에 남는다. 이미 쓴 slug는 바꾸거나 지우지 않는다.
 */

export type CurriculumCategory =
  | "economy-basics"
  | "market-basics"
  | "corporate-value"
  | "rates-bonds"
  | "macro"
  | "products"
  | "securities-business"
  | "risk"
  | "financial-statements"
  | "market-structure"
  | "global-markets";

/** 경제·IT 커리큘럼이 공유하는 모양. 개념 선정·검증 코드는 이 타입만 안다. */
export type Concept = {
  /** DB에 기록되는 고유 식별자. 한 번 정하면 바꾸지 않는다. */
  slug: string;
  title: string;
  level: number;
  category: string;
  /** 함께 다루면 좋은 개념. 하루 최대 2개까지 묶을 수 있다. */
  pairWith?: string;
  /** 더 알아보기. 사람이 고른 공식 문서·아티클이다. AI가 만들지 않는다. */
  references?: { title: string; url: string }[];
};

export type CurriculumConcept = Concept & { category: CurriculumCategory };

/** 지면에 표시하는 큰 갈래. 상식 카테고리 칩과 출제 순환의 기준이다. */
export type EconomyField = "economy" | "securities";

export function economyField(category: string): EconomyField {
  return ["economy-basics", "macro", "rates-bonds", "global-markets"].includes(category) ? "economy" : "securities";
}

const ALL: CurriculumConcept[] = [
  // 경제 기초 — 경제 뉴스를 읽는 데 필요한 기본기 (2026-10-18 추가)
  { slug: "supply-demand", title: "수요와 공급: 가격은 누가 정할까", level: 1, category: "economy-basics" },
  { slug: "inflation", title: "인플레이션: 같은 돈으로 살 수 있는 게 줄어드는 이유", level: 1, category: "economy-basics" },
  { slug: "deflation", title: "디플레이션: 물가가 내리면 왜 위험할까", level: 1, category: "economy-basics" },
  { slug: "business-cycle", title: "경기순환: 호황과 불황은 왜 반복될까", level: 1, category: "economy-basics" },
  { slug: "recession", title: "경기침체(리세션)는 어떻게 판단할까", level: 2, category: "economy-basics" },
  { slug: "employment-data", title: "실업률과 고용지표 읽는 법", level: 2, category: "economy-basics" },
  { slug: "ppi", title: "생산자물가(PPI)와 소비자물가의 차이", level: 2, category: "economy-basics" },
  { slug: "expected-inflation", title: "기대인플레이션: 사람들이 예상하는 물가", level: 2, category: "economy-basics" },
  { slug: "stagflation", title: "스태그플레이션: 경기는 나쁜데 물가는 오를 때", level: 2, category: "economy-basics" },
  { slug: "money-supply", title: "통화량(M2)과 유동성", level: 3, category: "economy-basics" },
  { slug: "qe-qt", title: "양적완화와 양적긴축", level: 3, category: "economy-basics" },
  { slug: "rate-and-fx", title: "금리가 오르면 환율은 어떻게 될까", level: 3, category: "economy-basics" },
  { slug: "trade-balance", title: "무역수지와 수출 지표", level: 3, category: "economy-basics" },
  { slug: "tariff", title: "관세는 누가 내고 누가 손해를 볼까", level: 3, category: "economy-basics" },
  { slug: "household-debt", title: "가계부채와 금리의 관계", level: 3, category: "economy-basics" },
  { slug: "housing-and-rates", title: "금리와 집값은 어떻게 연결될까", level: 3, category: "economy-basics" },
  { slug: "fx-reserves", title: "외환보유액은 왜 쌓아 둘까", level: 4, category: "economy-basics" },
  { slug: "sovereign-rating", title: "국가신용등급이 바뀌면 생기는 일", level: 4, category: "economy-basics" },
  { slug: "potential-growth", title: "잠재성장률: 나라 경제의 체력", level: 4, category: "economy-basics" },

  // LEVEL 1 — 시장 기본
  { slug: "stock-vs-bond", title: "주식과 채권의 차이", level: 1, category: "market-basics" },
  { slug: "market-cap", title: "시가총액", level: 1, category: "market-basics" },
  { slug: "kospi-kosdaq", title: "코스피와 코스닥", level: 1, category: "market-basics" },
  { slug: "bid-ask", title: "호가와 매수·매도", level: 1, category: "market-basics" },
  { slug: "trading-volume", title: "거래량과 거래대금", level: 1, category: "market-basics" },
  { slug: "stock-index", title: "주가지수", level: 1, category: "market-basics" },
  { slug: "dividend-yield", title: "배당과 배당수익률", level: 1, category: "market-basics" },
  { slug: "short-selling", title: "공매도", level: 1, category: "market-basics" },

  // LEVEL 2 — 기업가치
  { slug: "eps", title: "EPS", level: 2, category: "corporate-value", pairWith: "per" },
  { slug: "per", title: "PER", level: 2, category: "corporate-value" },
  { slug: "pbr", title: "PBR", level: 2, category: "corporate-value", pairWith: "roe" },
  { slug: "roe", title: "ROE", level: 2, category: "corporate-value" },
  { slug: "operating-vs-net-income", title: "영업이익과 당기순이익", level: 2, category: "corporate-value" },
  { slug: "enterprise-value", title: "기업가치와 시가총액", level: 2, category: "corporate-value" },
  { slug: "growth-vs-value", title: "성장주와 가치주", level: 2, category: "corporate-value" },

  // LEVEL 3 — 금리와 채권
  { slug: "base-rate", title: "기준금리", level: 3, category: "rates-bonds", pairWith: "market-rate" },
  { slug: "market-rate", title: "시장금리", level: 3, category: "rates-bonds" },
  { slug: "bond-price-vs-rate", title: "채권가격과 금리의 관계", level: 3, category: "rates-bonds" },
  { slug: "bond-yield", title: "채권수익률", level: 3, category: "rates-bonds" },
  { slug: "duration", title: "듀레이션", level: 3, category: "rates-bonds" },
  { slug: "term-spread", title: "장단기 금리차", level: 3, category: "rates-bonds", pairWith: "yield-curve" },
  { slug: "yield-curve", title: "Yield Curve", level: 3, category: "rates-bonds" },
  { slug: "credit-spread", title: "Credit Spread", level: 3, category: "rates-bonds" },

  // LEVEL 4 — 거시경제
  { slug: "cpi", title: "물가와 CPI", level: 4, category: "macro" },
  { slug: "gdp", title: "GDP", level: 4, category: "macro" },
  { slug: "fx-rate", title: "환율", level: 4, category: "macro", pairWith: "krw-strength" },
  { slug: "krw-strength", title: "원화 강세·약세", level: 4, category: "macro" },
  { slug: "current-account", title: "경상수지", level: 4, category: "macro" },
  { slug: "monetary-policy", title: "통화정책", level: 4, category: "macro", pairWith: "fiscal-policy" },
  { slug: "fiscal-policy", title: "재정정책", level: 4, category: "macro" },

  // LEVEL 5 — 금융상품
  { slug: "etf", title: "ETF", level: 5, category: "products", pairWith: "etn" },
  { slug: "etn", title: "ETN", level: 5, category: "products" },
  { slug: "fund", title: "펀드", level: 5, category: "products" },
  { slug: "futures", title: "선물", level: 5, category: "products", pairWith: "options" },
  { slug: "options", title: "옵션", level: 5, category: "products" },
  { slug: "els", title: "ELS", level: 5, category: "products", pairWith: "dls" },
  { slug: "dls", title: "DLS", level: 5, category: "products" },

  // LEVEL 6 — 증권사 업무
  { slug: "brokerage", title: "Brokerage", level: 6, category: "securities-business" },
  { slug: "wealth-management", title: "Wealth Management", level: 6, category: "securities-business" },
  { slug: "investment-banking", title: "Investment Banking", level: 6, category: "securities-business" },
  { slug: "ecm", title: "ECM", level: 6, category: "securities-business", pairWith: "dcm" },
  { slug: "dcm", title: "DCM", level: 6, category: "securities-business" },
  { slug: "sales-and-trading", title: "Sales & Trading", level: 6, category: "securities-business" },
  { slug: "proprietary-trading", title: "자기매매", level: 6, category: "securities-business" },
  { slug: "research", title: "증권사 리서치", level: 6, category: "securities-business" },
  { slug: "project-financing", title: "PF", level: 6, category: "securities-business" },
  { slug: "credit-offering", title: "신용공여", level: 6, category: "securities-business" },

  // LEVEL 7 — 리스크
  { slug: "leverage", title: "레버리지", level: 7, category: "risk" },
  { slug: "var", title: "VaR", level: 7, category: "risk" },
  { slug: "liquidity-risk", title: "유동성 위험", level: 7, category: "risk" },
  { slug: "credit-risk", title: "신용위험", level: 7, category: "risk" },
  { slug: "market-risk", title: "시장위험", level: 7, category: "risk" },
  { slug: "margin", title: "증거금", level: 7, category: "risk", pairWith: "forced-liquidation" },
  { slug: "forced-liquidation", title: "반대매매", level: 7, category: "risk" },
  { slug: "ncr", title: "NCR", level: 7, category: "risk" },

  // LEVEL 8 — 재무제표와 밸류에이션
  { slug: "balance-sheet", title: "재무상태표", level: 8, category: "financial-statements", pairWith: "income-statement" },
  { slug: "income-statement", title: "손익계산서", level: 8, category: "financial-statements" },
  { slug: "cash-flow-statement", title: "현금흐름표", level: 8, category: "financial-statements" },
  { slug: "ebitda", title: "EBITDA", level: 8, category: "financial-statements", pairWith: "ev-ebitda" },
  { slug: "ev-ebitda", title: "EV/EBITDA", level: 8, category: "financial-statements" },
  { slug: "debt-ratio", title: "부채비율", level: 8, category: "financial-statements" },
  { slug: "dcf", title: "DCF 현금흐름할인법", level: 8, category: "financial-statements" },
  { slug: "payout-ratio", title: "배당성향과 주주환원", level: 8, category: "financial-statements", pairWith: "share-buyback" },
  { slug: "share-buyback", title: "자사주 매입과 소각", level: 8, category: "financial-statements" },

  // LEVEL 9 — 시장 제도
  { slug: "public-vs-private-offering", title: "공모와 사모", level: 9, category: "market-structure" },
  { slug: "ipo-process", title: "IPO 절차와 수요예측", level: 9, category: "market-structure" },
  { slug: "rights-offering", title: "유상증자", level: 9, category: "market-structure", pairWith: "bonus-issue" },
  { slug: "bonus-issue", title: "무상증자", level: 9, category: "market-structure" },
  { slug: "stock-split", title: "액면분할", level: 9, category: "market-structure" },
  { slug: "convertible-bond", title: "전환사채 CB", level: 9, category: "market-structure", pairWith: "bond-with-warrant" },
  { slug: "bond-with-warrant", title: "신주인수권부사채 BW", level: 9, category: "market-structure" },
  { slug: "circuit-breaker", title: "서킷브레이커와 사이드카", level: 9, category: "market-structure" },
  { slug: "delisting", title: "관리종목과 상장폐지", level: 9, category: "market-structure" },
  { slug: "ex-dividend", title: "배당락과 권리락", level: 9, category: "market-structure" },
  { slug: "settlement", title: "예탁결제와 T+2", level: 9, category: "market-structure" },
  { slug: "disclosure", title: "공시제도", level: 9, category: "market-structure" },
  { slug: "insider-trading", title: "미공개정보 이용과 내부자거래", level: 9, category: "market-structure" },
  { slug: "capital-markets-act", title: "자본시장법", level: 9, category: "market-structure" },

  // LEVEL 10 — 글로벌 시장과 자산배분
  { slug: "us-indices", title: "미국 3대 지수", level: 10, category: "global-markets" },
  { slug: "fomc", title: "FOMC와 점도표", level: 10, category: "global-markets" },
  { slug: "us-treasury", title: "미국 국채", level: 10, category: "global-markets" },
  { slug: "dollar-index", title: "달러인덱스", level: 10, category: "global-markets" },
  { slug: "crude-oil", title: "유가와 원자재", level: 10, category: "global-markets" },
  { slug: "safe-haven", title: "금과 안전자산", level: 10, category: "global-markets" },
  { slug: "emerging-markets", title: "신흥국 시장", level: 10, category: "global-markets" },
  { slug: "msci", title: "MSCI 지수 편입", level: 10, category: "global-markets" },
  { slug: "carry-trade", title: "캐리트레이드", level: 10, category: "global-markets" },
  { slug: "asset-allocation", title: "자산배분", level: 10, category: "global-markets", pairWith: "diversification" },
  { slug: "diversification", title: "분산투자와 상관관계", level: 10, category: "global-markets" },
  { slug: "alpha-beta", title: "알파와 베타", level: 10, category: "global-markets" },
  { slug: "sharpe-ratio", title: "샤프지수", level: 10, category: "global-markets" },
];

export const CURRICULUM: CurriculumConcept[] = rotateByCategory(ALL, (concept) => economyField(concept.category));
