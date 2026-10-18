import { MarketImpact } from "@/components/briefing/MarketImpact";
import { RichText } from "@/components/briefing/RichText";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import { NEWS_CATEGORY_LABEL, NEWS_FIELD_LABEL, NEWS_REGION_LABEL, newsField } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

/**
 * 주요 이슈 한 건. 훑어볼 때는 제목과 '무슨 일이 있었나'만 보이고,
 * 자세히 보기를 펼치면 왜 중요한가 → 어떤 영향 → 해석·전망 → 출처가 이어진다.
 * 펼침은 <details>로 둔다. 상태를 들고 있지 않아도 되고 키보드로도 열린다.
 */
export function IssueCard({ issue, number }: { issue: NewsIssue; number: number }) {
  const primary = issue.sources[0];

  return (
    <article className="py-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[15px] font-bold tabular-nums text-ink">
          {String(number).padStart(2, "0")}
        </span>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">
          {NEWS_FIELD_LABEL[newsField(issue.category)]}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-soft">
          {NEWS_CATEGORY_LABEL[issue.category]}
        </span>
        <span className="text-xs font-medium text-ink-muted">{NEWS_REGION_LABEL[issue.region]}</span>
      </div>

      <h3 className="headline mt-3 text-[1.25rem] sm:text-[1.375rem]">{issue.title}</h3>

      {/* 무슨 일이 있었나. 원문 발췌라 해석을 섞지 않는다 */}
      <p className="article-body mt-2.5 text-[16px] leading-[1.75] text-ink-body">{issue.whatHappened}</p>

      <details className="group article-body mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">자세히 보기</span>
          <span className="hidden group-open:inline">접기</span>
          <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">⌄</span>
        </summary>

        <div className="mt-4 space-y-3">
          <section className="rounded-[20px] bg-surface p-5">
            <h4 className="text-[15px] font-bold text-ink">왜 중요한가</h4>
            <RichText text={issue.whyImportant} className="mt-2 text-[15px] leading-[1.75] text-ink-body" />
          </section>

          {issue.impact && (
            <section className="rounded-[20px] bg-surface p-5">
              <h4 className="text-[15px] font-bold text-ink">어떤 영향이 있을까</h4>
              <RichText text={issue.impact} className="mt-2 text-[15px] leading-[1.75] text-ink-body" />
            </section>
          )}

          <MarketImpact impact={issue.marketImpact} />

          {/* 해석·전망은 사실과 눈에 띄게 구분한다 */}
          {issue.interpretation && (
            <section className="border-l-2 border-rule pl-4">
              <h4 className="text-sm font-semibold text-ink-muted">해석·전망 (편집자 분석)</h4>
              <RichText text={issue.interpretation} className="mt-1.5 text-[15px] leading-[1.75] text-ink-soft" />
            </section>
          )}

          <SourceLinks sources={issue.sources} />
        </div>
      </details>

      {primary && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-2 inline-flex items-baseline gap-1.5 text-sm text-ink-muted"
        >
          <span className="font-semibold text-ink-soft">{primary.publisher}</span>
          <span className="group-hover:text-ink group-hover:underline">원문 ↗</span>
        </a>
      )}
    </article>
  );
}
