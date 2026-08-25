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
