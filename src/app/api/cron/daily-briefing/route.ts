import { createDailyBriefing } from "@/lib/briefing/create-daily-briefing";
import { summarizeAudit, type GenerationAudit } from "@/lib/news/generation-audit";
import { getTodayKST, isDateString } from "@/lib/date";
import { getServerEnv } from "@/lib/env";
import type { NextRequest } from "next/server";

/** 뉴스 검색·본문 수집·근거 선택·작성·검토를 수행한다. */
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
 *   dryRun=true      저장하지 않고 생성 결과를 그대로 돌려준다. 발행 전 검증용이다. DB에는 아무것도 쓰지 않는다.
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
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    const { briefing, reused, audit } = await createDailyBriefing(date, { force, dryRun });

    return Response.json({
      ok: true,
      reused,
      briefingDate: briefing.briefingDate,
      knowledgeCount: briefing.knowledgeItems.length,
      newsCount: briefing.newsItems.length,
      // IT 파트 생성에 실패했으면 null. 실패 사유는 generation_logs.audit.tech에 있다.
      techNewsCount: briefing.tech?.newsItems.length ?? null,
      // 뉴스가 기대보다 적을 때 원인을 바로 보기 위한 요약. CRON_SECRET이 있어야만 받는다.
      ...(audit && {
        diagnostics: {
          economy: summarizeAudit(audit),
          ...(audit.tech && { tech: summarizeAudit(audit.tech) }),
        },
      }),
      // 미리보기는 저장하지 않으므로 지면 전체를 응답으로 돌려준다.
      ...(dryRun && { dryRun: true, briefing }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] 브리핑 생성 실패(${date})`, error);

    // 생성에 실패해도 기존 브리핑은 그대로 남아 있다.
    const audit = error instanceof Error ? (error as Error & { audit?: GenerationAudit }).audit : undefined;
    return Response.json({
      ok: false,
      date,
      error: message,
      ...(audit && {
        diagnostics: {
          economy: summarizeAudit(audit),
          ...(audit.tech && { tech: summarizeAudit(audit.tech) }),
        },
      }),
    }, { status: 500 });
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
