import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { BriefingTabs } from "@/components/briefing/BriefingTabs";
import { KnowledgeSection } from "@/components/briefing/KnowledgeSection";
import { NewsSection } from "@/components/briefing/NewsSection";
import { StudyCompleteToggle } from "@/components/briefing/StudyCompleteToggle";
import { StudyLogProvider } from "@/components/briefing/StudyLogProvider";
import { StudyNote } from "@/components/briefing/StudyNote";
import type { Briefing, StudyLog } from "@/types/briefing";

/** 브리핑 본문. 메인(`/`)과 Archive 상세(`/archive/[date]`)가 같은 화면을 공유한다. */
export function BriefingBody({
  briefing,
  studyLog,
  canEdit,
}: {
  briefing: Briefing;
  studyLog: StudyLog | null;
  /** 로그인한 지면 주인만 완료 표시와 메모를 쓸 수 있다. */
  canEdit: boolean;
}) {
  return (
    <StudyLogProvider
      date={briefing.briefingDate}
      initialLog={studyLog}
      canEdit={canEdit}
    >
      <BriefingHeader
        todayKeywords={briefing.todayKeywords}
        oneLiner={briefing.oneLiner}
        generatedAt={briefing.generatedAt}
        action={<StudyCompleteToggle />}
      />

      {/* Desktop은 본문 + 메모 2단, Mobile은 메모가 본문 아래로 내려간다 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
        <div className="min-w-0">
          <BriefingTabs
            knowledgeCount={briefing.knowledgeItems.length}
            newsCount={briefing.newsItems.length}
            knowledge={<KnowledgeSection items={briefing.knowledgeItems} />}
            news={<NewsSection items={briefing.newsItems} />}
          />
        </div>

        <StudyNote />
      </div>
    </StudyLogProvider>
  );
}
