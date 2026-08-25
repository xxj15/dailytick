import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { BriefingTabs } from "@/components/briefing/BriefingTabs";
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

      <BriefingTabs
        knowledgeCount={briefing.knowledgeItems.length}
        newsCount={briefing.newsItems.length}
        knowledge={<KnowledgeSection items={briefing.knowledgeItems} />}
        news={<NewsSection items={briefing.newsItems} />}
      />
    </>
  );
}
