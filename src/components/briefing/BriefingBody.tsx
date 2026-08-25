import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { KnowledgeSection } from "@/components/briefing/KnowledgeSection";
import { NewsSection } from "@/components/briefing/NewsSection";
import type { Briefing } from "@/types/briefing";

/** 브리핑 본문. 메인(`/`)과 Archive 상세(`/archive/[date]`)가 같은 화면을 공유한다. */
export function BriefingBody({ briefing }: { briefing: Briefing }) {
  return (
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
  );
}
