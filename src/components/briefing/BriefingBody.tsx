import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { BriefingParts, type BriefingPart } from "@/components/briefing/BriefingParts";
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
  // Tech를 앞에 둔다. 경제 쪽은 이슈를 상식보다 먼저 보여준다. IT 파트가 없는 날(도입 이전, 생성 실패)은 그 사실만 알린다
  const parts: BriefingPart[] = [
    {
      key: "tech",
      label: "Tech",
      tabs: briefing.tech && [
        {
          key: "tech-knowledge",
          label: "IT 상식",
          count: briefing.tech.knowledgeItems.length,
          content: <KnowledgeSection items={briefing.tech.knowledgeItems} />,
        },
        {
          key: "tech-news",
          label: "IT 이슈",
          count: briefing.tech.newsItems.length,
          content: <NewsSection items={briefing.tech.newsItems} />,
        },
      ],
    },
    {
      key: "economy",
      label: "경제",
      tabs: [
        {
          key: "news",
          label: "요즘 이슈",
          count: briefing.newsItems.length,
          content: <NewsSection items={briefing.newsItems} />,
        },
        {
          key: "knowledge",
          label: "증권 상식",
          count: briefing.knowledgeItems.length,
          content: <KnowledgeSection items={briefing.knowledgeItems} />,
        },
      ],
    },
  ];

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
      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
        <div className="min-w-0">
          <BriefingParts parts={parts} />
        </div>

        <StudyNote />
      </div>
    </StudyLogProvider>
  );
}
