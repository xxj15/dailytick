"use client";

import { useOpenSection } from "@/components/briefing/BriefingTabs";
import { NEWS_CATEGORY_LABEL, NEWS_REGION_LABEL } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

/**
 * 신문 1면의 톱기사 자리.
 * 오늘 가장 중요한 이슈(rank 1)의 제목만 크게 걸어두고,
 * 본문은 경제 이슈 지면에서 이어 읽게 한다.
 */
export function LeadStory({ issue }: { issue: NewsIssue }) {
  const openSection = useOpenSection();
  const primary = issue.sources[0];

  const goToArticle = () => {
    openSection("news");
    // 지면이 새로 그려진 뒤에야 기사 위치를 잡을 수 있다
    requestAnimationFrame(() => {
      document
        .getElementById(`news-${issue.rank}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className="border-b border-rule py-10">
      <div className="flex flex-wrap items-center gap-3">
        <p className="label text-ink">Top Story</p>
        <span className="label rounded-full border border-rule px-2.5 py-1">
          {NEWS_CATEGORY_LABEL[issue.category]}
        </span>
        <span className="label rounded-full border border-rule px-2.5 py-1">
          {NEWS_REGION_LABEL[issue.region]}
        </span>
      </div>

      <h2 className="headline mt-4 max-w-4xl text-3xl leading-tight sm:text-[2.25rem]">
        {issue.title}
      </h2>

      <p className="article-body mt-4 line-clamp-2 text-[17px] leading-relaxed text-ink-muted">
        {issue.whatHappened}
      </p>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <button
          type="button"
          onClick={goToArticle}
          className="label text-ink underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
        >
          기사 이어 읽기 ↓
        </button>

        {primary && (
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-baseline gap-2"
          >
            <span className="label text-ink">{primary.publisher}</span>
            <span className="text-ink-muted transition-colors duration-200 group-hover:text-ink group-hover:underline">
              원문 읽기 ↗
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
