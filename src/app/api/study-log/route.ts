import { z } from "zod";
import { DATE_STRING_PATTERN } from "@/lib/date";
import { saveStudyLog } from "@/lib/supabase/study-logs";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** 브라우저는 Supabase에 직접 쓰지 않는다. 항상 이 route를 거친다. */
const bodySchema = z.object({
  date: z.string().regex(DATE_STRING_PATTERN, "date는 YYYY-MM-DD 형식이어야 합니다."),
  completed: z.boolean(),
  note: z.string().max(500, "메모는 500자까지 저장합니다.").nullable(),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const { date, completed, note } = parsed.data;

  try {
    const log = await saveStudyLog({
      date,
      completed,
      note: note?.trim() ? note.trim() : null,
    });

    return Response.json({ ok: true, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[study-log] 저장 실패(${date})`, error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
