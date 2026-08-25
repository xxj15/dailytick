"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type TabKey = "knowledge" | "news";

const SectionContext = createContext<((key: TabKey) => void) | null>(null);

/** 톱기사에서 경제 이슈 지면으로 넘어갈 때 쓴다. */
export function useOpenSection() {
  const open = useContext(SectionContext);
  if (!open) throw new Error("useOpenSection은 BriefingTabs 안에서만 쓴다.");
  return open;
}

/**
 * 증권 상식과 경제 이슈를 한 화면에 나란히 두면 어느 쪽도 눈에 들어오지 않는다.
 * 신문의 섹션처럼 지면을 나누고, 스크롤 중에도 어느 섹션인지 보이도록 붙여둔다.
 */
export function BriefingTabs({
  knowledge,
  news,
  knowledgeCount,
  newsCount,
  lead,
}: {
  knowledge: ReactNode;
  news: ReactNode;
  knowledgeCount: number;
  newsCount: number;
  /** 섹션 위에 올리는 톱기사. */
  lead?: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("knowledge");

  const open = useCallback((key: TabKey) => setActive(key), []);

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
    <SectionContext value={open}>
      {lead}

      <div
        role="tablist"
        className="sticky top-0 z-20 flex gap-8 border-b-2 border-ink bg-paper sm:gap-12"
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
              className="group relative py-4 text-left"
            >
              {/* 글자는 본문 왼쪽 선에 맞춰두고, 색만 좌우로 조금 넓게 깐다 */}
              <span
                aria-hidden
                className={`absolute -inset-x-3 inset-y-0 transition-colors duration-200 ${
                  selected ? "bg-muted" : "bg-transparent group-hover:bg-muted/60"
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

                <span className="mt-1 flex items-baseline gap-2">
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
                    className={`text-xs tabular-nums transition-colors duration-200 ${
                      selected ? "text-ink" : "text-rule"
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
    </SectionContext>
  );
}
