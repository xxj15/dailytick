import { MarketImpact } from "@/components/briefing/MarketImpact";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import { NEWS_CATEGORY_LABEL, NEWS_REGION_LABEL } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

export function NewsArticle({
  issue,
  index = 0,
  next,
}: {
  issue: NewsIssue;
  index?: number;
  /** 다음 기사로 이어 읽게 한다. 마지막 기사면 없다 */
  next?: NewsIssue;
}) {
  // 제목 바로 아래에 원문을 하나 걸어둔다. 나머지 출처는 기사 끝에 모은다
  const primary = issue.sources[0];

  return (
    <article
      id={`news-${issue.rank}`}
      // 목차에서 건너뛸 때 붙어 있는 섹션 탭에 제목이 가리지 않게 한다
      className="animate-panel-in scroll-mt-32 border-t border-ink pt-8 pb-14"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* 신문 기사 번호. 지면에서 순서를 먼저 읽게 한다 */}
        <span className="headline text-4xl leading-none tabular-nums">
          {String(issue.rank).padStart(2, "0")}
        </span>

        <span className="label rounded-full border border-rule px-2.5 py-1">
          {NEWS_CATEGORY_LABEL[issue.category]}
        </span>
        <span className="label rounded-full border border-rule px-2.5 py-1">
          {NEWS_REGION_LABEL[issue.region]}
        </span>
      </div>

      <h3 className="headline mt-4 text-2xl sm:text-3xl">{issue.title}</h3>

      {primary && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-3 inline-flex items-baseline gap-2 text-sm"
        >
          <span className="label text-ink">{primary.publisher}</span>
          <span className="text-ink-muted transition-colors duration-200 group-hover:text-ink group-hover:underline">
            원문 읽기 ↗
          </span>
        </a>
      )}

      {/* 리드 문단. 무슨 일이 있었는지가 가장 먼저, 가장 크게 읽혀야 한다 */}
      <div className="article-body mt-6">
        <p className="label">무슨 일이 있었나</p>
        <p className="mt-2 text-[17px] leading-relaxed">{issue.whatHappened}</p>
      </div>

      <div className="article-body mt-6 rounded-lg bg-muted p-5">
        <p className="label">왜 중요한가</p>
        <p className="mt-2 text-[15px]">{issue.whyImportant}</p>
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

      {next && (
        <a
          href={`#news-${next.rank}`}
          className="group mt-8 flex items-baseline gap-3 border-t border-rule pt-4"
        >
          <span className="label shrink-0">다음 기사</span>
          <span className="flex-1 text-sm transition-colors duration-200 group-hover:underline">
            {next.title}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-y-0.5"
          >
            ↓
          </span>
        </a>
      )}
    </article>
  );
}
