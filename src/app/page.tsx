import { ArchiveLink } from "@/components/briefing/ArchiveLink";
import { BriefingBody } from "@/components/briefing/BriefingBody";
import { EmptyBriefing } from "@/components/briefing/EmptyBriefing";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST, isBeforePublishTimeKST } from "@/lib/date";
import { getBriefingByDate, getLatestBriefing } from "@/lib/supabase/briefings";
import { getStudyLog } from "@/lib/supabase/study-logs";
import type { Briefing, StudyLog } from "@/types/briefing";

// 페이지는 항상 DB의 최신 상태를 읽는다. (OpenAI는 호출하지 않는다)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = getTodayKST();

  // AI 생성 실패나 DB 오류 때문에 페이지 전체가 500이 되어서는 안 된다.
  let briefing: Briefing | null = null;
  let latest: Briefing | null = null;
  let studyLog: StudyLog | null = null;

  try {
    briefing = await getBriefingByDate(today);
    if (briefing) studyLog = await getStudyLog(today);
    else latest = await getLatestBriefing();
  } catch (error) {
    console.error("[home] 브리핑 조회 실패", error);
  }

  return (
    <>
      <Masthead date={today} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {briefing ? (
          <BriefingBody briefing={briefing} studyLog={studyLog} />
        ) : (
          <EmptyBriefing
            beforePublishTime={isBeforePublishTimeKST()}
            latestDate={latest?.briefingDate ?? null}
          />
        )}

        <ArchiveLink />
      </main>

      <Footer />
    </>
  );
}
