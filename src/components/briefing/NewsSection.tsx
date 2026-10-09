import { NewsArticle } from "@/components/briefing/NewsArticle";
import { NewsRail } from "@/components/briefing/NewsRail";
import type { NewsIssue } from "@/types/briefing";

export function NewsSection({ items }: { items: NewsIssue[] }) {
  return (
    <section className="xl:grid xl:grid-cols-[9rem_minmax(0,1fr)] xl:gap-8">
      <NewsRail
        items={items.map((issue) => ({ rank: issue.rank, title: issue.title }))}
      />

      <div className="min-w-0">
        {items.some((item) => item.evidence) && items.length < 3 && (
          <p className="mb-8 text-sm leading-relaxed text-ink-muted">
            오늘은 본문 근거를 확보한 이슈 {items.length}건을 전합니다.
          </p>
        )}
        {items.map((issue, index) => (
          <NewsArticle
            key={`${issue.rank}-${issue.title}`}
            issue={issue}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
