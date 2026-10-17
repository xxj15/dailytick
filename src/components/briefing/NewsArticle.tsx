import { MarketImpact } from "@/components/briefing/MarketImpact";
import { RichText } from "@/components/briefing/RichText";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import { NEWS_CATEGORY_LABEL, NEWS_REGION_LABEL } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

export function NewsArticle({
  issue,
  index = 0,
}: {
  issue: NewsIssue;
  index?: number;
}) {
  // 제목 바로 아래에 원문을 하나 걸어둔다. 나머지 출처는 기사 끝에 모은다
  const primary = issue.sources[0];

  return (
    <article
      id={`news-${issue.rank}`}
      // 목차에서 건너뛸 때 붙어 있는 섹션 탭에 제목이 가리지 않게 한다
      className="animate-panel-in scroll-mt-32 border-t border-rule pt-12 pb-12 first:border-t-0 first:pt-0"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* 기사 번호. 지면에서 순서를 먼저 읽게 한다 */}
        <span className="mr-1 text-lg font-bold text-primary tabular-nums">
          {String(issue.rank).padStart(2, "0")}
        </span>

        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
          {NEWS_CATEGORY_LABEL[issue.category]}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
          {NEWS_REGION_LABEL[issue.region]}
        </span>
      </div>

      <h3 className="headline mt-3 text-2xl sm:text-[1.75rem]">{issue.title}</h3>

      {primary && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-3 inline-flex items-baseline gap-2 text-sm"
        >
          <span className="font-semibold text-ink-soft">{primary.publisher}</span>
          <span className="text-primary transition-colors duration-200 group-hover:text-primary-strong group-hover:underline">
            원문 읽기 ↗
          </span>
        </a>
      )}

      {/* 리드 문단. 무슨 일이 있었는지가 가장 먼저, 가장 크게 읽혀야 한다 */}
      <div className="article-body mt-6">
        <p className="label">무슨 일이 있었나{issue.evidence ? " · 출처 원문 발췌" : ""}</p>
        <p className="mt-2 text-[17px] leading-[1.8] text-ink-body">{issue.whatHappened}</p>
      </div>

      <div className="article-body mt-6 rounded-[20px] bg-primary-weak p-5">
        <p className="label text-primary">왜 중요한가</p>
        <RichText text={issue.whyImportant} className="mt-2 text-[16px] leading-[1.75] text-ink-body" />
      </div>

      <MarketImpact impact={issue.marketImpact} />

      {/* 해석은 사실과 시각적으로도 구분한다 */}
      {issue.interpretation && (
        <div className="article-body card mt-3 p-5">
          <p className="label">해석</p>
          <RichText text={issue.interpretation} className="mt-1.5 text-[15px] leading-[1.75] text-ink-soft" />
        </div>
      )}

      <SourceLinks sources={issue.sources} />
    </article>
  );
}
