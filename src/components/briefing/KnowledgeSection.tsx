import type { KnowledgeItem } from "@/types/briefing";

export function KnowledgeSection({ items }: { items: KnowledgeItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="space-y-14">
        {items.map((item, index) => (
          <article
            key={item.slug}
            className="animate-panel-in border-t border-ink pt-8 first:border-t-0 first:pt-0"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="label">
                Level {item.level}
                <span className="mx-2 text-rule">/</span>
                {item.category}
              </p>

              {/* 왜 전에 본 개념이 또 나왔는지 알 수 있게 한다 */}
              {item.review && (
                <span className="label rounded-full bg-ink px-2.5 py-1 text-paper">
                  복습
                </span>
              )}
            </div>

            <h3 className="headline mt-2 text-2xl sm:text-[1.75rem]">{item.title}</h3>

            <p className="article-body mt-4 text-[17px] leading-relaxed font-medium">
              {item.definition}
            </p>
            <p className="article-body mt-3 text-[16px] leading-relaxed text-ink-muted">
              {item.explanation}
            </p>

            {item.example && (
              <div className="article-body mt-4 border-l-4 border-rule pl-4">
                <p className="label">Example</p>
                <p className="mt-1.5 text-[15px] text-ink-muted">{item.example}</p>
              </div>
            )}

            <div className="article-body mt-6 rounded-lg bg-muted p-5">
              <p className="label">Why it matters</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {item.securitiesPoint}
              </p>
            </div>

            <div className="article-body mt-6 border-l-4 border-ink pl-4">
              <p className="label">Interview</p>
              <p className="headline mt-1.5 text-lg">
                &ldquo;{item.interviewQuestion}&rdquo;
              </p>
            </div>

            {item.keywords.length > 0 && (
              <p className="label mt-5">{item.keywords.join(" · ")}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
