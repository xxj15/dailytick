import { NewsArticle } from "@/components/briefing/NewsArticle";
import type { NewsIssue } from "@/types/briefing";

export function NewsSection({ items }: { items: NewsIssue[] }) {
  return (
    <section>
      <h2 className="label border-b border-ink pb-2">오늘의 경제 이슈</h2>

      <div className="mt-8">
        {items.map((issue) => (
          <NewsArticle key={`${issue.rank}-${issue.title}`} issue={issue} />
        ))}
      </div>
    </section>
  );
}
