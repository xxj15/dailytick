"use client";

import { useState, type ReactNode } from "react";

type TabKey = "knowledge" | "news";

/**
 * 증권 상식과 경제 이슈를 한 화면에 나란히 두면 어느 쪽도 눈에 들어오지 않는다.
 * 한 번에 하나씩만 읽도록 지면을 나눈다.
 */
export function BriefingTabs({
  knowledge,
  news,
  knowledgeCount,
  newsCount,
}: {
  knowledge: ReactNode;
  news: ReactNode;
  knowledgeCount: number;
  newsCount: number;
}) {
  const [active, setActive] = useState<TabKey>("knowledge");

  const tabs = [
    { key: "knowledge" as const, label: "오늘의 증권 상식", count: knowledgeCount },
    { key: "news" as const, label: "오늘의 경제 이슈", count: newsCount },
  ];

  return (
    <div>
      <div role="tablist" className="flex border-b border-rule">
        {tabs.map((tab) => {
          const selected = tab.key === active;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={`-mb-px flex-1 border-b-2 px-2 py-4 text-center text-sm font-semibold sm:flex-none sm:px-8 sm:text-base ${
                selected
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
              <span className="ml-2 text-xs tabular-nums text-ink-muted">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-knowledge"
        aria-labelledby="tab-knowledge"
        hidden={active !== "knowledge"}
        className="py-10"
      >
        {knowledge}
      </div>

      <div
        role="tabpanel"
        id="panel-news"
        aria-labelledby="tab-news"
        hidden={active !== "news"}
        className="py-10"
      >
        {news}
      </div>
    </div>
  );
}
