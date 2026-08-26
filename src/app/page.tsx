import { BriefingBody } from "@/components/briefing/BriefingBody";
import { EmptyBriefing } from "@/components/briefing/EmptyBriefing";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { isLoggedIn } from "@/lib/auth";
import { getTodayKST, isBeforePublishTimeKST } from "@/lib/date";
import { getBriefingByDate, getLatestBriefing } from "@/lib/supabase/briefings";
import { getStudyLog } from "@/lib/supabase/study-logs";
import type { Briefing, StudyLog } from "@/types/briefing";

// 페이지는 항상 DB의 최신 상태를 읽는다. (OpenAI는 호출하지 않는다)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = getTodayKST();
  // 학습 기록은 주인 것이다. 비로그인 방문자에게는 아예 내려보내지 않는다.
  const canEdit = await isLoggedIn();

  // AI 생성 실패나 DB 오류 때문에 페이지 전체가 500이 되어서는 안 된다.
  let briefing: Briefing | null = null;
  let latest: Briefing | null = null;
  let studyLog: StudyLog | null = null;

  try {
    briefing = await getBriefingByDate(today);
    if (!briefing) latest = await getLatestBriefing();
    else if (canEdit) studyLog = await getStudyLog(today);
  } catch (error) {
    console.error("[home] 브리핑 조회 실패", error);
  }

  return (
    <>
      <Masthead date={today} loggedIn={canEdit} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {briefing ? (
          <BriefingBody
            briefing={briefing}
            studyLog={studyLog}
            canEdit={canEdit}
          />
        ) : (
          <EmptyBriefing
            beforePublishTime={isBeforePublishTimeKST()}
            latestDate={latest?.briefingDate ?? null}
          />
        )}
      </main>

      <Footer />
    </>
  );
}
