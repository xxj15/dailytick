import "server-only";
import type { DateString } from "@/lib/date";
import { getSupabase } from "@/lib/supabase/client";
import type { StudyLog, StudyLogRow } from "@/types/briefing";

const TABLE = "study_logs";
const COLUMNS = "briefing_date, completed_at, note";

function toStudyLog(row: StudyLogRow): StudyLog {
  return {
    briefingDate: row.briefing_date,
    completedAt: row.completed_at,
    note: row.note,
  };
}

export async function getStudyLog(date: DateString): Promise<StudyLog | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .eq("briefing_date", date)
    .maybeSingle<StudyLogRow>();

  if (error) throw new Error(`학습 기록 조회 실패(${date}): ${error.message}`);
  return data ? toStudyLog(data) : null;
}

/** Archive 목록에 완료 여부와 메모를 함께 보여주기 위한 조회. */
export async function getStudyLogs(limit = 180): Promise<StudyLog[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLUMNS)
    .order("briefing_date", { ascending: false })
    .limit(limit)
    .returns<StudyLogRow[]>();

  if (error) throw new Error(`학습 기록 목록 조회 실패: ${error.message}`);
  return (data ?? []).map(toStudyLog);
}

/** 완료 여부와 메모를 저장한다. 하루당 한 행이므로 upsert. */
export async function saveStudyLog(params: {
  date: DateString;
  completed: boolean;
  note: string | null;
}): Promise<StudyLog> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(
      {
        briefing_date: params.date,
        // 완료를 취소하면 시각을 지운다.
        completed_at: params.completed ? new Date().toISOString() : null,
        note: params.note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "briefing_date" },
    )
    .select(COLUMNS)
    .single<StudyLogRow>();

  if (error)
    throw new Error(`학습 기록 저장 실패(${params.date}): ${error.message}`);
  return toStudyLog(data);
}
