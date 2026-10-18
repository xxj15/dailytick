import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { BriefingTabs, type BriefingTab } from "@/components/briefing/BriefingTabs";
import { IssueCard } from "@/components/briefing/IssueCard";
import { IssuesSection } from "@/components/briefing/IssuesSection";
import { KnowledgeSection } from "@/components/briefing/KnowledgeSection";
import { StudyCompleteToggle } from "@/components/briefing/StudyCompleteToggle";
import { StudyLogProvider } from "@/components/briefing/StudyLogProvider";
import { StudyNote } from "@/components/briefing/StudyNote";
import { newsField } from "@/lib/labels";
import type { Briefing, StudyLog } from "@/types/briefing";

/**
 * 브리핑 본문. 메인(`/`)과 Archive 상세(`/archive/[date]`)가 같은 화면을 공유한다.
 *
 *   오늘의 테크 상식 · 오늘의 경제 상식 — 천천히 읽고 배우는 자리
 *   오늘의 주요 이슈 — 빠르게 훑는 자리
 */
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
  // 주요 이슈는 한 데스크가 중요도 순으로 고른다. 2026-10-19 이전 지면은 IT 데스크 뉴스가 따로 있어 앞에 붙인다.
  const news = [...briefing.newsItems, ...(briefing.tech?.newsItems ?? [])]
    .map((issue) => ({ issue, field: newsField(issue.category) }));

  const tabs: BriefingTab[] = [
    ...(briefing.tech
      ? [{
          key: "tech-knowledge",
          label: "테크 상식",
          count: briefing.tech.knowledgeItems.length,
          content: <KnowledgeSection items={briefing.tech.knowledgeItems} />,
        }]
      : []),
    {
      key: "economy-knowledge",
      label: "경제 상식",
      count: briefing.knowledgeItems.length,
      content: <KnowledgeSection items={briefing.knowledgeItems} />,
    },
    {
      key: "issues",
      label: "주요 이슈",
      count: news.length,
      content: (
        <IssuesSection
          issues={news.map(({ issue, field }, index) => ({
            key: `${field}-${issue.title}`,
            field,
            card: <IssueCard issue={issue} number={index + 1} />,
          }))}
        />
      ),
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
          <BriefingTabs tabs={tabs} />
        </div>

        <StudyNote />
      </div>
    </StudyLogProvider>
  );
}
