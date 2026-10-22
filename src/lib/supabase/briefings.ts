import "server-only";
import { getSupabase } from "@/lib/supabase/client";
import type {
  ArchiveEntry,
  Briefing,
  BriefingRow,
  ConceptHistoryEntry,
  DailyBriefingContent,
  KnowledgeArchiveEntry,
  RecentNewsEntry,
  TechSection,
} from "@/types/briefing";
import type { DateString } from "@/lib/date";

const TABLE = "briefings";
const COLUMNS =
  "id, briefing_date, knowledge_items, news_items, today_keywords, one_liner, tech_knowledge_items, tech_news_items, generated_at, model, prompt_version";

function toBriefing(row: BriefingRow): Briefing {
  return {
    id: row.id,
    briefingDate: row.briefing_date,
    knowledgeItems: row.knowledge_items,
    newsItems: row.news_items,
    // 지난 브리핑에는 둘 중 하나가 없을 수 있다. 화면에서 그 줄만 비운다.
    todayKeywords: row.today_keywords ?? [],
    oneLiner: row.one_liner ?? "",
    tech:
      row.tech_knowledge_items && row.tech_news_items
        ? { knowledgeItems: row.tech_knowledge_items, newsItems: row.tech_news_items }
        : null,
    generatedAt: row.generated_at,
    model: row.model,
    promptVersion: row.prompt_version,
  };
}

export async function getBriefingByDate(
  date: DateString,
): Promise<Briefing | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("briefing_date", date)
    .maybeSingle<BriefingRow>();

  if (error) throw new Error(`브리핑 조회 실패(${date}): ${error.message}`);
  return data ? toBriefing(data) : null;
}

/** 가장 최근 브리핑. 오늘 브리핑이 아직 없을 때 대체 링크로 사용한다. */
export async function getLatestBriefing(): Promise<Briefing | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .order("briefing_date", { ascending: false })
    .limit(1)
    .maybeSingle<BriefingRow>();

  if (error) throw new Error(`최신 브리핑 조회 실패: ${error.message}`);
  return data ? toBriefing(data) : null;
}

/**
 * 학습 이력. 개념 중복 판정과 복습 순번에 쓴다.
 *
 * 여기에 행 수 제한을 두면 창 밖으로 밀려난 개념이 '안 배운 것'으로 판정돼
 * 다시 출제된다. 그래서 개념 slug만 담긴 가벼운 컬럼을 전부 읽는다.
 * (Supabase 기본 상한 1000행 = 약 3년치)
 */
export function getConceptHistory(): Promise<ConceptHistoryEntry[]> {
  return readConceptHistory("knowledge_items");
}

/** IT 개념 학습 이력. IT 파트가 없던 날은 빈 줄로 들어온다. */
export function getTechConceptHistory(): Promise<ConceptHistoryEntry[]> {
  return readConceptHistory("tech_knowledge_items");
}

async function readConceptHistory(
  column: "knowledge_items" | "tech_knowledge_items",
): Promise<ConceptHistoryEntry[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(`briefing_date, ${column}`)
    .order("briefing_date", { ascending: false })
    .returns<(Pick<BriefingRow, "briefing_date"> & Partial<Pick<BriefingRow, typeof column>>)[]>();

  if (error) throw new Error(`학습 이력 조회 실패(${column}): ${error.message}`);

  return (data ?? []).map((row) => ({
    briefingDate: row.briefing_date,
    items: (row[column] ?? []).map((item) => ({
      slug: item.slug,
      title: item.title,
      category: item.category,
      format: item.format,
      level: item.level,
      url: item.references?.[0]?.url,
    })),
  }));
}

/** Archive 리스트용. 날짜와 개념 제목만 읽는다. 최신순. 테크 상식이 앞에 온다. */
export async function getArchiveEntries(limit = 180): Promise<ArchiveEntry[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("briefing_date, knowledge_items, tech_knowledge_items")
    .order("briefing_date", { ascending: false })
    .limit(limit)
    .returns<Pick<BriefingRow, "briefing_date" | "knowledge_items" | "tech_knowledge_items">[]>();

  if (error) throw new Error(`Archive 조회 실패: ${error.message}`);

  return (data ?? []).map((row) => ({
    briefingDate: row.briefing_date,
    knowledgeTitles: [...(row.tech_knowledge_items ?? []), ...(row.knowledge_items ?? [])].map((item) => item.title),
  }));
}

/**
 * 기준일 이전 days일 동안 실은 뉴스. 기준일 당일 row(재생성 대상)는 넣지 않는다.
 * 2026-10-22 사용자 요청으로 사흘에서 7일로 늘렸다. 하루 최대 세 건이라 고르기·작성·검토 입력이 크게 늘지 않는다.
 */
export async function getRecentNews(date: DateString, days = 7): Promise<RecentNewsEntry[]> {
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("briefing_date, news_items, tech_news_items")
    .gte("briefing_date", from)
    .lt("briefing_date", date)
    .order("briefing_date", { ascending: false })
    .returns<Pick<BriefingRow, "briefing_date" | "news_items" | "tech_news_items">[]>();

  if (error) throw new Error(`최근 뉴스 조회 실패: ${error.message}`);

  return (data ?? []).flatMap((row) =>
    [...(row.news_items ?? []), ...(row.tech_news_items ?? [])].map((item) => ({
      briefingDate: row.briefing_date,
      title: item.title,
      whatHappened: item.whatHappened.slice(0, 200),
      urls: item.sources.map((source) => source.url),
      sourceTitles: item.sources.map((source) => source.title),
    })),
  );
}

/**
 * 상식 학습 이력. 지금까지 배운 개념을 하나씩 펼친다. 최신순.
 * 개념 slug·제목·분류만 읽는다. 본문은 날짜 상세에서 다시 읽는다.
 */
export async function getKnowledgeArchive(): Promise<KnowledgeArchiveEntry[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("briefing_date, knowledge_items, tech_knowledge_items")
    .order("briefing_date", { ascending: false })
    .returns<Pick<BriefingRow, "briefing_date" | "knowledge_items" | "tech_knowledge_items">[]>();

  if (error) throw new Error(`상식 이력 조회 실패: ${error.message}`);

  return (data ?? []).flatMap((row) =>
    [...(row.tech_knowledge_items ?? []), ...(row.knowledge_items ?? [])].map((item) => ({
      briefingDate: row.briefing_date,
      slug: item.slug,
      title: item.title,
      category: item.category,
      review: item.review === true,
    })),
  );
}

/** 지난 호 이동용. 기준 날짜의 앞/뒤 브리핑 날짜. 없으면 null. */
export async function getAdjacentBriefingDates(date: DateString): Promise<{
  prev: DateString | null;
  next: DateString | null;
}> {
  const pick = async (direction: "prev" | "next") => {
    const query = getSupabase().from(TABLE).select("briefing_date").limit(1);

    const { data, error } =
      direction === "prev"
        ? await query
            .lt("briefing_date", date)
            .order("briefing_date", { ascending: false })
            .maybeSingle<{ briefing_date: string }>()
        : await query
            .gt("briefing_date", date)
            .order("briefing_date", { ascending: true })
            .maybeSingle<{ briefing_date: string }>();

    if (error) throw new Error(`인접 브리핑 조회 실패(${date}): ${error.message}`);
    return data?.briefing_date ?? null;
  };

  const [prev, next] = await Promise.all([pick("prev"), pick("next")]);
  return { prev, next };
}

/**
 * 브리핑 저장.
 * briefing_date에 unique constraint가 있으므로 같은 날 재실행해도 row는 하나다.
 * force 재생성 시에만 기존 row를 덮어쓴다.
 */
export async function saveBriefing(params: {
  date: DateString;
  content: DailyBriefingContent;
  /** IT 파트 생성에 실패한 날은 null로 저장하고 경제 파트만 발행한다. */
  tech: TechSection | null;
  model: string;
  promptVersion: string;
}): Promise<Briefing> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(
      {
        briefing_date: params.date,
        knowledge_items: params.content.knowledgeItems,
        news_items: params.content.newsItems,
        today_keywords: params.content.todayKeywords,
        one_liner: params.content.oneLiner,
        tech_knowledge_items: params.tech?.knowledgeItems ?? null,
        tech_news_items: params.tech?.newsItems ?? null,
        generated_at: new Date().toISOString(),
        model: params.model,
        prompt_version: params.promptVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "briefing_date" },
    )
    .select(COLUMNS)
    .single<BriefingRow>();

  if (error) throw new Error(`브리핑 저장 실패(${params.date}): ${error.message}`);
  return toBriefing(data);
}
