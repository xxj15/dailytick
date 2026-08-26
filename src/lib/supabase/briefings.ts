import "server-only";
import { getSupabase } from "@/lib/supabase/client";
import type {
  ArchiveEntry,
  Briefing,
  BriefingRow,
  ConceptHistoryEntry,
  DailyBriefingContent,
} from "@/types/briefing";
import type { DateString } from "@/lib/date";

const TABLE = "briefings";
const COLUMNS =
  "id, briefing_date, knowledge_items, news_items, today_keywords, one_liner, generated_at, model, prompt_version";

function toBriefing(row: BriefingRow): Briefing {
  return {
    id: row.id,
    briefingDate: row.briefing_date,
    knowledgeItems: row.knowledge_items,
    newsItems: row.news_items,
    // 지난 브리핑에는 둘 중 하나가 없을 수 있다. 화면에서 그 줄만 비운다.
    todayKeywords: row.today_keywords ?? [],
    oneLiner: row.one_liner ?? "",
    generatedAt: row.generated_at,
    model: row.model,
    promptVersion: row.prompt_version,
  };
}

/** 특정 날짜의 브리핑. 없으면 null. */
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
export async function getConceptHistory(): Promise<ConceptHistoryEntry[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("briefing_date, knowledge_items")
    .order("briefing_date", { ascending: false })
    .returns<Pick<BriefingRow, "briefing_date" | "knowledge_items">[]>();

  if (error) throw new Error(`학습 이력 조회 실패: ${error.message}`);

  return (data ?? []).map((row) => ({
    briefingDate: row.briefing_date,
    items: (row.knowledge_items ?? []).map((item) => ({
      slug: item.slug,
      title: item.title,
    })),
  }));
}

/** Archive 리스트용. 날짜와 개념 제목만 읽는다. 최신순. */
export async function getArchiveEntries(limit = 180): Promise<ArchiveEntry[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("briefing_date, knowledge_items")
    .order("briefing_date", { ascending: false })
    .limit(limit)
    .returns<Pick<BriefingRow, "briefing_date" | "knowledge_items">[]>();

  if (error) throw new Error(`Archive 조회 실패: ${error.message}`);

  return (data ?? []).map((row) => ({
    briefingDate: row.briefing_date,
    knowledgeTitles: (row.knowledge_items ?? []).map((item) => item.title),
  }));
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
