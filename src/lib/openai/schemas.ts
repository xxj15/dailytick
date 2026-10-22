import { z } from "zod";
import { ECONOMY_CONCEPTS_PER_DAY, LEGACY_NEWS_SLOTS, NEWS_PER_DAY, NEWS_SLOTS, TECH_CONCEPTS_PER_DAY, TECH_NEWS_PER_DAY, TODAY_KEYWORDS_PER_DAY } from "@/config/app";

/**
 * AI 응답 검증 스키마.
 * AI 자유 텍스트를 그대로 DB에 저장하지 않는다. 항상 이 스키마를 통과한 값만 저장한다.
 */

export const newsRegionSchema = z.enum(["KR", "GLOBAL"]);

/** 주요 이슈의 자리. 오늘의 화제·경제·IT. 규칙은 config/app.ts의 NEWS_SLOTS에 있다. AI 응답은 이 슬롯만 쓴다. */
export const newsSlotSchema = z.enum(NEWS_SLOTS);

/** 저장된 기사의 자리. 지금 슬롯에 더해 예전 슬롯(국내 정세)도 읽는다. */
export const storedNewsSlotSchema = z.enum([...NEWS_SLOTS, ...LEGACY_NEWS_SLOTS]);

export const newsCategorySchema = z.enum([
  "rates",
  "stocks",
  "fx",
  "macro",
  "industry",
  "policy",
  "geopolitics",
  "commodities",
  // 시사
  "politics",
  "society",
  "world",
  "science",
  // 이하 IT 파트
  "ai",
  "semiconductor",
  "software",
  "platform",
  "security",
  "other",
]);

export const newsSourceSchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  publishedAt: z.string().optional(),
});

export const marketImpactSchema = z.object({
  stocks: z.string().optional(),
  rates: z.string().optional(),
  fx: z.string().optional(),
  industry: z.string().optional(),
});

/** 과거 row에는 없으므로 newsIssueSchema의 evidence 필드만 optional이다. */
export const newsEvidenceSchema = z.object({
  candidateId: z.string().min(1),
  /** role은 2026-10-20부터 있다. 그 이전 row는 사실 1~3개에 role이 없다. */
  facts: z.array(z.object({ id: z.string(), sourceId: z.string(), quote: z.string().min(25).max(400), role: z.enum(["event", "background"]).optional() })).min(1).max(4),
  documents: z.array(z.object({
    id: z.string(), requestedUrl: z.url(), url: z.url(), fetchedAt: z.string(), contentHash: z.string(),
  })).min(1),
});

export const newsIssueSchema = z.object({
  rank: z.number().int().positive(),
  /** 2026-10-19 이전 row와 테크 파트 뉴스에는 없다. 없으면 지금처럼 rank 순서로만 보여준다. 2026-10-19~20 row에는 domestic이 있다. */
  slot: storedNewsSlotSchema.optional(),
  title: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,

  /** 사실: 실제로 발표되거나 보도된 내용. 근거 문장(무슨 일) 그대로다 */
  whatHappened: z.string().min(1),
  /** 사실: 원인·배경. 근거 문장(원인·배경) 그대로다. 지면에는 핵심 요약의 끝에 붙는다. 2026-10-20 이전 row에는 없다. */
  background: z.string().optional(),
  whyImportant: z.string().min(1),
  /** 어떤 영향이 있을까: 산업·경제·사회에 미칠 수 있는 영향. 2026-10-18 이전 row에는 없다. */
  impact: z.string().optional(),
  marketImpact: marketImpactSchema,

  /** 해석: 사실과 반드시 구분한다 */
  interpretation: z.string().optional(),

  /** 알아둘 점. 2026-10-20 오후 row에만 있다. 지금은 쓰지 않는다(왜 읽을 만한가에 합쳤다). */
  takeaway: z.string().optional(),

  sources: z.array(newsSourceSchema).min(1, "출처 없는 뉴스는 발행하지 않는다."),
  evidence: newsEvidenceSchema.optional(),

  /** 최근 며칠 안에 실은 사건의 후속이면 그 사건 제목. 새로 확인된 변화가 있을 때만 다시 싣는다. */
  followUp: z.string().optional(),
});

export const knowledgeItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: z.number().int().positive(),
  category: z.string().min(1),

  definition: z.string().min(1),
  explanation: z.string().min(1),
  example: z.string().optional(),

  /** IT 파트에서는 '실무에서 어디에 쓰이는가'를 담는다. 화면 라벨은 Why it matters로 같다. */
  securitiesPoint: z.string().min(1),
  /** 2026-10-17부터 생성하지 않는다. 그 이전 row에만 남아 있다. */
  interviewQuestion: z.string().optional(),

  keywords: z.array(z.string().min(1)),

  /** 콘텐츠 형식(개념·아티클·트렌드·실무). 서버가 선정 결과로 붙인다. 이전 row에는 없다. */
  format: z.enum(["concept", "article", "trend", "practice"]).optional(),

  /** 더 알아보기. 커리큘럼에 사람이 적어 둔 링크를 서버가 붙인다. AI 응답에서 받지 않는다. */
  references: z.array(z.object({ title: z.string().min(1), url: z.url() })).optional(),

  /**
   * 커리큘럼을 한 바퀴 돈 뒤의 복습인가.
   * AI가 정하지 않는다. 개념을 고른 코드가 저장 직전에 적어 넣는다.
   */
  review: z.boolean().optional(),
});

/** STEP 2 — Daily Briefing 생성 결과 */
export const dailyBriefingSchema = z
  .object({
    /**
     * 하루 경제 상식 개수(ECONOMY_CONCEPTS_PER_DAY)에서 상한을 만든다. 짝 개념으로 두 개를 싣던 날이 있어 2개까지는 허용한다.
     * 실제 개수는 verify.ts가 고른 개념 수와 맞춘다.
     */
    knowledgeItems: z.array(knowledgeItemSchema).min(1).max(Math.max(ECONOMY_CONCEPTS_PER_DAY, 2)),
    /**
     * 하루 최대 건수(슬롯 수)는 여기서 막지 않는다. AI 출력의 required slot과 verify.ts의 슬롯 고유성 검사가 막는다.
     * 여기서 막으면 rank 없는 위반이라 마지막 시도에서 넘친 뉴스만 뺄 수 없고 그날 지면 전체가 실패한다.
     * 상한은 트림을 막지 않을 만큼 넉넉히 둔다.
     */
    newsItems: z
      .array(newsIssueSchema)
      .min(NEWS_PER_DAY.min)
      .max(NEWS_SLOTS.length * 2),
    /**
     * 오늘 지면을 여는 키워드.
     * 글자 수는 프롬프트로만 유도한다. 길이 때문에 브리핑 전체를 버리지 않는다.
     */
    todayKeywords: z
      .array(z.string().min(1))
      .min(TODAY_KEYWORDS_PER_DAY.min)
      .max(TODAY_KEYWORDS_PER_DAY.max),

    /**
     * 키워드 아래 붙는 한 줄. 왜 오늘 이 단어들이 중요한지를 설명한다.
     * 길이는 프롬프트로만 유도한다. 한두 글자 초과로 브리핑을 버리지 않는다.
     */
    oneLiner: z.string().min(1),
  });

/**
 * IT 파트. 키워드·한 줄은 경제 파트가 지면 맨 위에서 맡으므로 두지 않는다.
 * 2026-10-19부터 IT 뉴스는 '주요 이슈' 한 데스크에서 함께 고르므로 이 파트는 테크 상식만 담는다.
 * 이전 row에는 IT 뉴스가 들어 있어 newsItems를 그대로 읽는다.
 */
export const techSectionSchema = z.object({
  /** 하루 테크 상식 개수(TECH_CONCEPTS_PER_DAY)가 상한이다. 실제 개수는 verify.ts가 고른 개념 수와 맞춘다. */
  knowledgeItems: z.array(knowledgeItemSchema).min(1).max(TECH_CONCEPTS_PER_DAY),
  newsItems: z.array(newsIssueSchema).max(TECH_NEWS_PER_DAY.max),
});

/** STEP 1 — 뉴스 후보. RSS에서 고른 기사(rss.ts candidatesFromPicks)와 테크 상식 원문이 이 모양이다. */
export const newsCandidateSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  region: newsRegionSchema,
  category: newsCategorySchema,
  // 고르기 평가 점수의 가중합이다(소수 첫째 자리). 근거 확인 순서를 정하므로 정수로 뭉개지 않는다. 범위 밖 값은 버리지 않고 1~10으로 자른다.
  importance: z.number().transform((value) => Math.min(10, Math.max(1, Math.round(value * 10) / 10))),
  sources: z.array(newsSourceSchema).min(1),
});

/* ------------------------------------------------------------------
 * OpenAI Structured Output 전용 스키마
 *
 * strict 모드 제약이 위 canonical 스키마와 다르다.
 *   - 모든 필드가 required여야 한다. `.optional()`은 SDK가 거부하므로 `.nullable()`을 쓴다.
 *   - minItems/maximum/format 같은 제약은 지원하지 않으므로 넣지 않는다.
 *
 * 따라서 이 스키마는 "모양"만 강제하고,
 * 개수·URL 형식·국내/글로벌 균형 같은 실제 규칙은 canonical 스키마가 검증한다.
 * AI 응답은 반드시 canonical 스키마를 통과한 뒤에만 저장된다.
 * ------------------------------------------------------------------ */

export const aiNewsIssueSchema = z.object({
  rank: z.number(),
  /** 새로 쓰는 기사는 반드시 슬롯 하나에 들어간다. 슬롯 규칙은 verify.ts가 검사한다. */
  slot: newsSlotSchema,
  candidateId: z.string(),
  followUp: z.string().nullable(),
  /** 검색 단계가 매긴 지역이 틀렸을 때 작성 단계에서 바로잡는다. 검토 지적을 재시도로 고칠 수 있어야 한다. */
  region: newsRegionSchema,
  factIds: z.array(z.string()),
  title: z.string(),
  /** 왜 읽을 만한가. 1~2문장. 2026-10-20부터 영향·시장 영향·해석·알아둘 점을 따로 쓰지 않는다(기사는 짧게, 자세한 내용은 원문). */
  whyImportant: z.string(),
});

const aiKnowledgeItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  level: z.number(),
  category: z.string(),
  definition: z.string(),
  explanation: z.string(),
  example: z.string().nullable(),
  securitiesPoint: z.string(),
  keywords: z.array(z.string()),
});

/** STEP 2 응답 형식 */
export const aiDailyBriefingSchema = z.object({
  knowledgeItems: z.array(aiKnowledgeItemSchema),
  newsItems: z.array(aiNewsIssueSchema),
  todayKeywords: z.array(z.string()),
  oneLiner: z.string(),
});

/** 테크 상식 작성 응답. 테크 파트는 뉴스를 쓰지 않는다. */
export const aiTechKnowledgeSchema = z.object({
  knowledgeItems: z.array(aiKnowledgeItemSchema),
});

/** 상식 큐레이터 응답. id는 코드가 후보 목록과 다시 대조한다. */
export const curatorSchema = z.object({
  picks: z.array(z.object({ id: z.string(), title: z.string(), reason: z.string() })),
});

/**
 * STEP 1 응답 형식. RSS 기사 목록에서 고른 후보. 출처 URL은 서버가 itemIds로 붙인다.
 * 후보마다 평가 점수(1~10)와 선정 이유를 받는다. 서버가 점수를 가중합해 후보 순서를 정하고, 하한 미달 후보는 뺀다(rss.ts).
 * rejected는 눈에 띄지만 고르지 않은 기사와 그 이유다. 생성 로그에만 남는다.
 */
export const aiNewsSelectionSchema = z.object({
  candidates: z.array(z.object({
    itemIds: z.array(z.string()),
    title: z.string(),
    summary: z.string(),
    region: newsRegionSchema,
    category: newsCategorySchema,
    scores: z.object({
      value: z.number(),
      timeliness: z.number(),
      impact: z.number(),
      novelty: z.number(),
    }),
    reason: z.string(),
  })),
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })),
});

/**
 * structured output은 값이 없을 때 null을 쓰지만 canonical 스키마는 optional(undefined)을 쓴다.
 * 저장 전에 null을 제거한다. (null을 정상값으로 쓰는 필드는 없다)
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNulls(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null) continue;
      result[key] = stripNulls(item);
    }
    return result as T;
  }

  return value;
}
