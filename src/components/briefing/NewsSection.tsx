import { NewsArticle } from "@/components/briefing/NewsArticle";
import { NewsRail } from "@/components/briefing/NewsRail";
import type { NewsIssue } from "@/types/briefing";

export function NewsSection({ items }: { items: NewsIssue[] }) {
  return (
    <section>
      <NewsRail
        items={items.map((issue) => ({ rank: issue.rank, title: issue.title }))}
      />

      {items.map((issue, index) => (
        <NewsArticle
          key={`${issue.rank}-${issue.title}`}
          issue={issue}
          index={index}
          next={items[index + 1]}
        />
      ))}
    </section>
  );
}
