import type { KnowledgeItem } from "@/types/briefing";

export function KnowledgeSection({ items }: { items: KnowledgeItem[] }) {
  if (items.length === 0) return null;

  return (
    // 뉴스 지면이 길어도 개념은 화면에 남아 있게 한다. (Desktop만)
    <section className="lg:sticky lg:top-8 lg:self-start">
      <h2 className="label border-b border-ink pb-2">오늘의 증권 상식</h2>

      <div className="mt-8 space-y-12">
        {items.map((item) => (
          <article key={item.slug}>
            <p className="label">
              Level {item.level}
              <span className="mx-2 text-rule">/</span>
              {item.category}
            </p>

            <h3 className="headline mt-2 text-xl">{item.title}</h3>

            <p className="mt-4 text-[15px] font-medium">{item.definition}</p>
            <p className="mt-3 text-[15px]">{item.explanation}</p>

            {item.example && (
              <div className="mt-4 border-l-2 border-rule pl-4">
                <p className="label">Example</p>
                <p className="mt-1.5 text-sm text-ink-muted">{item.example}</p>
              </div>
            )}

            <div className="mt-6 border-t border-rule pt-4">
              <p className="label">Why it matters</p>
              <p className="mt-1.5 text-sm">{item.securitiesPoint}</p>
            </div>

            <div className="mt-5">
              <p className="label">Interview</p>
              <p className="headline mt-1.5 text-base">
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
