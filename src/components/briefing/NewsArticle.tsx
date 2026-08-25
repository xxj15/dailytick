import { MarketImpact } from "@/components/briefing/MarketImpact";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import { NEWS_CATEGORY_LABEL, NEWS_REGION_LABEL } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

export function NewsArticle({ issue }: { issue: NewsIssue }) {
  return (
    <article className="border-t border-rule py-10 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-4">
        {/* 신문 기사 번호. 지면에서 순서를 먼저 읽게 한다 */}
        <span className="headline shrink-0 text-2xl leading-none tabular-nums">
          {String(issue.rank).padStart(2, "0")}
        </span>

        <p className="label">
          {NEWS_CATEGORY_LABEL[issue.category]}
          <span className="mx-2 text-rule">/</span>
          {NEWS_REGION_LABEL[issue.region]}
        </p>
      </div>

      <h3 className="headline mt-4 text-xl sm:text-2xl">{issue.title}</h3>

      <div className="article-body mt-5 space-y-5">
        <div>
          <p className="label">무슨 일이 있었나</p>
          <p className="mt-1.5 text-[15px]">{issue.whatHappened}</p>
        </div>

        <div>
          <p className="label">왜 중요한가</p>
          <p className="mt-1.5 text-[15px]">{issue.whyImportant}</p>
        </div>
      </div>

      <MarketImpact impact={issue.marketImpact} />

      {/* 해석은 사실과 시각적으로도 구분한다 */}
      {issue.interpretation && (
        <div className="article-body mt-6 border-l-2 border-rule pl-4">
          <p className="label">해석</p>
          <p className="mt-1.5 text-sm text-ink-muted">{issue.interpretation}</p>
        </div>
      )}

      <SourceLinks sources={issue.sources} />
    </article>
  );
}
