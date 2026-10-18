import { RichText } from "@/components/briefing/RichText";
import { knowledgeLabel } from "@/lib/labels";
import type { KnowledgeItem } from "@/types/briefing";

/**
 * 상식 한 편을 짧은 기술 블로그 글처럼 읽게 한다.
 * 오늘의 개념(리드) → 쉽게 이해하기 → 예시 → 왜 알아야 할까 → 더 알아보기 순으로 내려간다.
 * 줄 길이는 article-body로 묶는다.
 */
export function KnowledgeSection({ items }: { items: KnowledgeItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="space-y-16">
        {items.map((item, index) => {
          const label = knowledgeLabel(item.category);

          return (
          <article
            key={item.slug}
            className="article-body animate-panel-in border-t border-rule pt-14 first:border-t-0 first:pt-0"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-ink-soft">
                {label.field}
              </span>
              {label.detail && <span className="text-xs font-medium text-ink-muted">{label.detail}</span>}

              {/* 왜 전에 본 개념이 또 나왔는지 알 수 있게 한다 */}
              {item.review && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">
                  복습
                </span>
              )}
            </div>

            <h3 className="headline mt-2 text-[1.625rem] sm:text-[1.875rem]">{item.title}</h3>

            {/* 리드. 한 번 읽고 무엇에 관한 글인지 잡히게 한다 */}
            <RichText
              text={item.definition}
              className="mt-5 text-[18px] leading-[1.75] font-medium text-ink"
            />

            <RichText
              text={item.explanation}
              className="mt-6 text-[17px] leading-[1.8] text-ink-body"
            />

            {item.example && (
              <div className="mt-9">
                <h4 className="text-[15px] font-bold text-ink">예를 들면</h4>
                <RichText
                  text={item.example}
                  className="mt-2.5 text-[16px] leading-[1.8] text-ink-body"
                />
              </div>
            )}

            <div className="mt-9 rounded-[20px] bg-surface p-5 sm:p-6">
              <h4 className="text-[15px] font-bold text-ink">왜 알아야 할까</h4>
              <RichText
                text={item.securitiesPoint}
                className="mt-2 text-[16px] leading-[1.75] text-ink-body"
              />
            </div>

            {/* 사람이 고른 공식 문서·아티클. AI가 만든 링크는 싣지 않는다 */}
            {item.references && item.references.length > 0 && (
              <div className="mt-8">
                <h4 className="text-[15px] font-bold text-ink">더 알아보기</h4>
                <ul className="mt-2 space-y-1.5">
                  {item.references.map((reference) => (
                    <li key={reference.url}>
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-baseline gap-1.5 text-[15px] text-ink-body"
                      >
                        <span className="group-hover:underline">{reference.title}</span>
                        <span aria-hidden className="text-ink-muted">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {item.keywords.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-x-3 gap-y-1">
                {item.keywords.map((keyword) => (
                  <li key={keyword} className="text-sm font-medium text-ink-muted">
                    #{keyword}
                  </li>
                ))}
              </ul>
            )}
          </article>
          );
        })}
      </div>
    </section>
  );
}
