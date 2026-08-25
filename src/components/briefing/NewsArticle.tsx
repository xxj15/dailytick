import { MarketImpact } from "@/components/briefing/MarketImpact";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import type { NewsIssue } from "@/types/briefing";

export function NewsArticle({ issue }: { issue: NewsIssue }) {
  return (
    <article className="border-t border-rule py-8 first:border-t-0 first:pt-0">
      <p className="label">
        {String(issue.rank).padStart(2, "0")} / {issue.category}
        <span className="mx-2 text-rule">·</span>
        {issue.region}
      </p>

      <h3 className="headline mt-3 text-xl sm:text-2xl">{issue.title}</h3>

      <div className="mt-5 space-y-5">
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
        <div className="mt-6 border-l-2 border-rule pl-4">
          <p className="label">해석</p>
          <p className="mt-1.5 text-sm text-ink-muted">{issue.interpretation}</p>
        </div>
      )}

      <SourceLinks sources={issue.sources} />
    </article>
  );
}
