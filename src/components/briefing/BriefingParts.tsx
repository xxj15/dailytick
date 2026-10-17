"use client";

import { useState } from "react";
import { BriefingTabs, type BriefingTab } from "@/components/briefing/BriefingTabs";

export type BriefingPart = {
  key: string;
  label: string;
  /** 그날 이 파트가 없으면 null. 탭은 남겨두고 없다는 사실을 알린다 */
  tabs: BriefingTab[] | null;
};

/**
 * Tech와 경제를 큰 갈래로 먼저 고르고, 그 안에서 상식·이슈 탭을 고른다.
 * 처음에는 내용이 있는 첫 파트를 펼친다.
 */
export function BriefingParts({ parts }: { parts: BriefingPart[] }) {
  const [active, setActive] = useState(
    (parts.find((part) => part.tabs) ?? parts[0])?.key,
  );
  const current = parts.find((part) => part.key === active) ?? parts[0];

  return (
    <>
      <div role="tablist" aria-label="브리핑 파트" className="inline-flex rounded-full bg-muted p-1">
        {parts.map((part) => {
          const selected = part.key === current?.key;

          return (
            <button
              key={part.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(part.key)}
              className={`rounded-full px-6 py-2 text-[15px] font-semibold transition-colors duration-200 ${
                selected ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
              }`}
            >
              {part.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {current?.tabs ? (
          // 파트를 바꾸면 안쪽 탭도 첫 탭부터 다시 연다
          <BriefingTabs key={current.key} tabs={current.tabs} />
        ) : (
          <p className="card mt-2 px-6 py-14 text-center text-[15px] text-ink-muted">
            이 날은 {current?.label} 브리핑이 발행되지 않았습니다.
          </p>
        )}
      </div>
    </>
  );
}
