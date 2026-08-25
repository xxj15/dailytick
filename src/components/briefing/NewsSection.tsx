import { NewsArticle } from "@/components/briefing/NewsArticle";
import { NEWS_REGION_LABEL } from "@/lib/labels";
import type { NewsIssue } from "@/types/briefing";

export function NewsSection({ items }: { items: NewsIssue[] }) {
  return (
    <section>
      {/* 다섯 개가 그냥 이어지면 어디부터 읽을지 알 수 없다. 지면 목차를 먼저 준다 */}
      <nav aria-label="오늘의 경제 이슈 목차" className="pb-2">
        <p className="label">오늘의 지면</p>

        <ol className="mt-3 border-t border-rule">
          {items.map((issue) => (
            <li key={`toc-${issue.rank}`} className="border-b border-rule">
              <a
                href={`#news-${issue.rank}`}
                className="group flex items-baseline gap-4 py-3 transition-colors duration-200 hover:bg-muted"
              >
                <span className="headline w-6 shrink-0 text-sm tabular-nums text-ink-muted">
                  {String(issue.rank).padStart(2, "0")}
                </span>

                <span className="flex-1 text-sm group-hover:underline">
                  {issue.title}
                </span>

                <span className="label hidden shrink-0 sm:block">
                  {NEWS_REGION_LABEL[issue.region]}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div>
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
