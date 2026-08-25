import { formatSourceDate } from "@/lib/date";
import type { NewsSource } from "@/types/briefing";

/** 출처는 반드시 클릭 가능해야 하고 새 탭으로 연다. */
export function SourceLinks({ sources }: { sources: NewsSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-6 border-t border-rule pt-4">
      <p className="label">Source</p>

      <ul className="mt-2.5 space-y-2">
        {sources.map((source) => {
          const publishedAt = formatSourceDate(source.publishedAt);

          return (
            <li key={source.url} className="text-sm leading-relaxed">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-wrap items-baseline gap-x-2"
              >
                <span className="label text-ink group-hover:underline">
                  {source.publisher}
                </span>
                <span className="text-ink-muted group-hover:text-ink">
                  {source.title}
                </span>
                {publishedAt && (
                  <span className="label shrink-0 tabular-nums">
                    {publishedAt}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
