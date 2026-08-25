/**
 * 금융 개념 Curriculum.
 *
 * AI가 매일 마음대로 주제를 고르지 않는다.
 * 학습 순서는 이 배열의 순서를 그대로 따른다. (기초 → 중급)
 * 순서를 바꾸면 학습 흐름이 바뀌므로 신중하게 수정한다.
 */

export type CurriculumCategory =
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

export type CurriculumConcept = {
  /** DB에 기록되는 고유 식별자. 한 번 정하면 바꾸지 않는다. */
  slug: string;
  title: string;
  level: number;
  category: CurriculumCategory;
  /** 함께 다루면 좋은 개념. 하루 최대 2개까지 묶을 수 있다. */
  pairWith?: string;
};

export const CURRICULUM: CurriculumConcept[] = [
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

export const CURRICULUM_BY_SLUG = new Map(
  CURRICULUM.map((concept) => [concept.slug, concept]),
);
