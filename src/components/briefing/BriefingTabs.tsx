"use client";

import { useState, type ReactNode } from "react";

export type BriefingTab = {
  key: string;
  label: string;
  count: number;
  content: ReactNode;
};

/**
 * 상식과 이슈를 한 화면에 나란히 두면 어느 쪽도 눈에 들어오지 않는다.
 * 탭으로 지면을 나누고, 스크롤 중에도 어느 섹션인지 보이도록 붙여둔다.
 * 경제·IT 파트를 합치면 탭이 넷이라 좁은 화면에서는 가로로 밀어서 본다.
 */
export function BriefingTabs({ tabs }: { tabs: BriefingTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <>
      <div
        role="tablist"
        // 헤더(h-14) 바로 아래에 붙는다
        className="scrollbar-none sticky top-14 z-20 -mx-5 flex gap-6 overflow-x-auto border-b border-rule bg-paper/90 px-5 backdrop-blur-md sm:mx-0 sm:px-0"
      >
        {tabs.map((tab) => {
          const selected = tab.key === current?.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="briefing-panel"
              id={`tab-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={`relative flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap text-[15px] transition-colors duration-200 sm:text-base ${
                selected
                  ? "font-bold text-ink"
                  : "font-medium text-ink-muted hover:text-ink-soft"
              }`}
            >
              {tab.label}
              <span
                className={`text-[13px] tabular-nums ${
                  selected ? "font-semibold text-primary" : "text-ink-muted/70"
                }`}
              >
                {tab.count}
              </span>

              {/* 지금 펼친 탭 아래에 굵은 밑줄 */}
              <span
                aria-hidden
                className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors duration-200 ${
                  selected ? "bg-ink" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* key를 바꿔 패널을 다시 마운트한다. 섹션이 바뀐 것이 눈에 보이도록 */}
      <div
        key={current?.key}
        role="tabpanel"
        id="briefing-panel"
        aria-labelledby={`tab-${current?.key}`}
        className="animate-panel-in pt-8 pb-4"
      >
        {current?.content}
      </div>
    </>
  );
}
