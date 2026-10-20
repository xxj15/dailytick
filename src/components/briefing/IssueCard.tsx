import { MarketImpact } from "@/components/briefing/MarketImpact";
import { RichText } from "@/components/briefing/RichText";
import { SourceLinks } from "@/components/briefing/SourceLinks";
import { NEWS_CATEGORY_LABEL, NEWS_FIELD_LABEL, NEWS_REGION_LABEL, NEWS_SLOT_LABEL, newsField } from "@/lib/labels";
import { decodeHtmlEntities } from "@/lib/news/entities";
import type { NewsIssue } from "@/types/briefing";

/**
 * 주요 이슈 한 건. 기사를 길게 분석하지 않고, 읽어 볼 만한지 빠르게 판단하게 한다(2026-10-20 사용자 결정).
 *   제목 → 핵심 요약(원문 근거 문장 그대로) → 왜 읽을 만한가 → 원문 링크
 * 예전 기사에 있는 영향·시장 영향·해석·알아둘 점은 '자세히 보기'에 접어 둔다. 상태를 들고 있지 않도록 <details>로 둔다.
 */
export function IssueCard({ issue, number }: { issue: NewsIssue; number: number }) {
  const primary = issue.sources[0];
  // 무슨 일 문장 뒤에 원인·배경 문장을 잇는다. 둘 다 원문 발췌라 해석을 섞지 않는다
  const summary = [issue.whatHappened, issue.background].filter(Boolean).join(" ");
  const hasMarketImpact = Object.values(issue.marketImpact ?? {}).some(Boolean);
  const hasLegacyDetail = Boolean(issue.impact || issue.takeaway || issue.interpretation || hasMarketImpact);

  return (
    <article className="py-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[15px] font-bold tabular-nums text-ink">
          {String(number).padStart(2, "0")}
        </span>
        {/* 슬롯(주요 시사·경제·IT)이 있으면 그 자리를 먼저 보여준다. 슬롯 도입 전 기사는 분야를 보여준다. */}
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">
          {issue.slot ? NEWS_SLOT_LABEL[issue.slot] : NEWS_FIELD_LABEL[newsField(issue.category)]}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-soft">
          {NEWS_CATEGORY_LABEL[issue.category]}
        </span>
        {/* 예전 국내 슬롯은 라벨이 이미 지역을 말한다 */}
        {issue.slot !== "domestic" && (
          <span className="text-xs font-medium text-ink-muted">{NEWS_REGION_LABEL[issue.region]}</span>
        )}
      </div>

      <h3 className="headline mt-3 text-[1.25rem] sm:text-[1.375rem]">{decodeHtmlEntities(issue.title)}</h3>

      {/* 핵심 요약 */}
      <p className="article-body mt-2.5 text-[16px] leading-[1.75] text-ink-body">{summary}</p>

      {/* 왜 읽을 만한가. 예전 기사에서는 '왜 중요한가'였다 */}
      <div className="article-body mt-4 border-l-2 border-rule pl-4">
        <h4 className="text-[13px] font-semibold text-ink-muted">왜 읽을 만한가</h4>
        <RichText text={issue.whyImportant} className="mt-1 text-[15px] leading-[1.75] text-ink-body" />
      </div>

      {hasLegacyDetail && (
        <details className="group article-body mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">자세히 보기</span>
            <span className="hidden group-open:inline">접기</span>
            <span aria-hidden className="transition-transform duration-200 group-open:rotate-180">⌄</span>
          </summary>

          <div className="mt-4 space-y-3">
            {issue.takeaway && (
              <section className="rounded-[20px] bg-surface p-5">
                <h4 className="text-[15px] font-bold text-ink">알아둘 점</h4>
                <RichText text={issue.takeaway} className="mt-2 text-[15px] leading-[1.75] text-ink-body" />
              </section>
            )}

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
          </div>
        </details>
      )}

      {/* 원문을 바로 읽을 수 있게 맨 앞 출처를 크게 건다. 나머지 출처는 아래에 둔다 */}
      {primary && (
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-4 inline-flex items-baseline gap-1.5 text-sm"
        >
          <span className="font-semibold text-ink group-hover:underline">원문 읽기</span>
          <span className="text-ink-muted">{decodeHtmlEntities(primary.publisher)} ↗</span>
        </a>
      )}

      {issue.sources.length > 1 && <SourceLinks sources={issue.sources} />}
    </article>
  );
}
