import { createDailyBriefing } from "@/lib/briefing/create-daily-briefing";
import { getTodayKST, isDateString } from "@/lib/date";
import { getServerEnv } from "@/lib/env";
import type { NextRequest } from "next/server";

/** 뉴스 검색 + 2단계 생성이라 오래 걸린다. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * 브리핑 생성 endpoint.
 *
 * Scheduler → HTTP endpoint → createDailyBriefing()
 * 스케줄러(Vercel Cron / 외부 스케줄러)를 바꿔도 생성 로직은 건드리지 않는다.
 *
 * 쿼리 파라미터:
 *   date=YYYY-MM-DD  생성할 날짜. 기본값은 KST 기준 오늘.
 *   force=true       이미 있어도 다시 생성한다. 개발용이며 production cron은 쓰지 않는다.
 */
export async function POST(request: NextRequest) {
  const unauthorized = checkAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;

  const dateParam = searchParams.get("date");
  if (dateParam && !isDateString(dateParam)) {
    return Response.json(
      { ok: false, error: "date는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  const date = dateParam ?? getTodayKST();
  const force = searchParams.get("force") === "true";

  try {
    const { briefing, reused } = await createDailyBriefing(date, { force });

    return Response.json({
      ok: true,
      reused,
      briefingDate: briefing.briefingDate,
      knowledgeCount: briefing.knowledgeItems.length,
      newsCount: briefing.newsItems.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] 브리핑 생성 실패(${date})`, error);

    // 생성에 실패해도 기존 브리핑은 그대로 남아 있다.
    return Response.json({ ok: false, date, error: message }, { status: 500 });
  }
}

/** Vercel Cron은 GET으로 호출한다. 동작은 POST와 같다. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/** CRON_SECRET이 일치하지 않으면 401. 통과하면 null. */
function checkAuth(request: NextRequest): Response | null {
  let expected: string;

  try {
    expected = getServerEnv().CRON_SECRET;
  } catch (error) {
    console.error("[cron] 환경변수 오류", error);
    return Response.json(
      { ok: false, error: "서버 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
