import type { KnowledgeItem } from "@/types/briefing";

export function KnowledgeSection({ items }: { items: KnowledgeItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="space-y-12">
        {items.map((item, index) => (
          <article
            key={item.slug}
            className="animate-panel-in border-t border-rule pt-12 first:border-t-0 first:pt-0"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-weak px-2.5 py-1 text-xs font-semibold text-primary">
                Lv.{item.level}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
                {item.category}
              </span>

              {/* 왜 전에 본 개념이 또 나왔는지 알 수 있게 한다 */}
              {item.review && (
                <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-paper">
                  복습
                </span>
              )}
            </div>

            <h3 className="headline mt-4 text-2xl sm:text-[1.75rem]">{item.title}</h3>

            <p className="article-body mt-4 text-[17px] leading-relaxed font-medium">
              {item.definition}
            </p>
            <p className="article-body mt-3 text-[16px] leading-relaxed text-ink-soft">
              {item.explanation}
            </p>

            {item.example && (
              <div className="article-body card mt-6 p-5">
                <p className="label">예시</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{item.example}</p>
              </div>
            )}

            <div className="article-body mt-3 rounded-[20px] bg-primary-weak p-5">
              <p className="label text-primary">왜 알아야 할까</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {item.securitiesPoint}
              </p>
            </div>


            {item.keywords.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {item.keywords.map((keyword) => (
                  <li key={keyword} className="text-sm font-medium text-ink-muted">
                    #{keyword}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
