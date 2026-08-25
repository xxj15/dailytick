import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { EmptyBriefing } from "@/components/briefing/EmptyBriefing";
import { KnowledgeSection } from "@/components/briefing/KnowledgeSection";
import { NewsSection } from "@/components/briefing/NewsSection";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST, isBeforePublishTimeKST } from "@/lib/date";
import { getBriefingByDate, getLatestBriefing } from "@/lib/supabase/briefings";
import type { Briefing } from "@/types/briefing";

// 페이지는 항상 DB의 최신 상태를 읽는다. (OpenAI는 호출하지 않는다)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = getTodayKST();

  // AI 생성 실패나 DB 오류 때문에 페이지 전체가 500이 되어서는 안 된다.
  let briefing: Briefing | null = null;
  let latest: Briefing | null = null;

  try {
    briefing = await getBriefingByDate(today);
    if (!briefing) latest = await getLatestBriefing();
  } catch (error) {
    console.error("[home] 브리핑 조회 실패", error);
  }

  return (
    <>
      <Masthead date={today} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {briefing ? (
          <>
            <BriefingHeader
              oneLiner={briefing.oneLiner}
              generatedAt={briefing.generatedAt}
            />

            {/* Desktop 2단 (Knowledge 35% / News 65%), Mobile 1단 */}
            <div className="grid gap-12 py-12 lg:grid-cols-[35fr_65fr] lg:gap-16">
              <KnowledgeSection items={briefing.knowledgeItems} />
              <NewsSection items={briefing.newsItems} />
            </div>
          </>
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
