"use client";

import { useState, type ReactNode } from "react";

type TabKey = "knowledge" | "news";

/**
 * 증권 상식과 경제 이슈를 한 화면에 나란히 두면 어느 쪽도 눈에 들어오지 않는다.
 * 신문의 섹션처럼 지면을 나누고, 스크롤 중에도 어느 섹션인지 보이도록 붙여둔다.
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
    {
      key: "knowledge" as const,
      section: "Section 01",
      label: "오늘의 증권 상식",
      count: knowledgeCount,
    },
    {
      key: "news" as const,
      section: "Section 02",
      label: "오늘의 경제 이슈",
      count: newsCount,
    },
  ];

  return (
    <>
      <div
        role="tablist"
        className="sticky top-0 z-20 flex gap-2 border-b-2 border-ink bg-paper sm:gap-3"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="briefing-panel"
              id={`tab-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className="group relative px-3 py-4 text-left sm:px-4"
            >
              <span
                aria-hidden
                className={`absolute inset-0 transition-colors duration-200 ${
                  selected ? "bg-muted" : "bg-transparent group-hover:bg-muted"
                }`}
              />

              {/* 지금 펼친 섹션 위에 신문 섹션기처럼 굵은 줄을 하나 얹는다 */}
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-[3px] transition-colors duration-200 ${
                  selected ? "bg-ink" : "bg-transparent"
                }`}
              />

              <span className="relative block">
                <span
                  className={`label block transition-colors duration-200 ${
                    selected ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {tab.section}
                </span>

                <span className="mt-1 flex items-center gap-2">
                  <span
                    className={`headline text-base transition-colors duration-200 sm:text-lg ${
                      selected
                        ? "text-ink"
                        : "text-ink-muted group-hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </span>

                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors duration-200 ${
                      selected
                        ? "bg-ink text-paper"
                        : "bg-muted text-ink-muted group-hover:bg-paper"
                    }`}
                  >
                    {tab.count}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* key를 바꿔 패널을 다시 마운트한다. 섹션이 바뀐 것이 눈에 보이도록 */}
      <div
        key={active}
        role="tabpanel"
        id="briefing-panel"
        aria-labelledby={`tab-${active}`}
        className="animate-panel-in pt-10 pb-4"
      >
        {active === "knowledge" ? knowledge : news}
      </div>
    </>
  );
}
