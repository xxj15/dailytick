import "server-only";
import { getSupabase } from "@/lib/supabase/client";
import type {
  ArchiveEntry,
  Briefing,
  BriefingRow,
  DailyBriefingContent,
} from "@/types/briefing";
import type { DateString } from "@/lib/date";

const TABLE = "briefings";
const COLUMNS =
  "id, briefing_date, knowledge_items, news_items, one_liner, generated_at, model, prompt_version";

function toBriefing(row: BriefingRow): Briefing {
  return {
    id: row.id,
    briefingDate: row.briefing_date,
    knowledgeItems: row.knowledge_items,
    newsItems: row.news_items,
    oneLiner: row.one_liner,
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

/** Archive 목록 및 학습 이력 조회용. 최신순. */
export async function getPreviousBriefings(limit = 60): Promise<Briefing[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .order("briefing_date", { ascending: false })
    .limit(limit)
    .returns<BriefingRow[]>();

  if (error) throw new Error(`과거 브리핑 조회 실패: ${error.message}`);
  return (data ?? []).map(toBriefing);
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
