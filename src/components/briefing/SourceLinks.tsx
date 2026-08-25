import type { NewsSource } from "@/types/briefing";

export function SourceLinks({ sources }: { sources: NewsSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="label">Source</p>
      <ul className="mt-2 space-y-1">
        {sources.map((source) => (
          <li key={source.url} className="text-sm text-ink-muted">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="prose-link text-ink"
            >
              {source.publisher}
            </a>
            <span className="mx-2 text-rule">·</span>
            <span>{source.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
