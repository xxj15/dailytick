import { NewsArticle } from "@/components/briefing/NewsArticle";
import type { NewsIssue } from "@/types/briefing";

export function NewsSection({ items }: { items: NewsIssue[] }) {
  return (
    <section className="mx-auto max-w-3xl">
      <div>
        {items.map((issue) => (
          <NewsArticle key={`${issue.rank}-${issue.title}`} issue={issue} />
        ))}
      </div>
    </section>
  );
}
