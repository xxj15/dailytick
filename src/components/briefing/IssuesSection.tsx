"use client";

import { useState, type ReactNode } from "react";
import { NEWS_FIELD_LABEL, type NewsField } from "@/lib/labels";

const FIELD_ORDER: NewsField[] = ["politics", "world", "society", "economy", "tech"];

/**
 * 오늘의 주요 이슈. 분야 칩으로 걸러 본다.
 * 카드는 서버에서 그려 받고, 여기서는 어떤 카드를 보여줄지만 정한다.
 */
export function IssuesSection({
  issues,
  filterable = true,
}: {
  issues: { key: string; field: NewsField; card: ReactNode }[];
  /** 슬롯(오늘의 화제·경제·IT)으로 실은 지면은 카드 라벨이 슬롯이라 분야 칩을 두지 않는다. */
  filterable?: boolean;
}) {
  const [field, setField] = useState<NewsField | "all">("all");
  const fields = FIELD_ORDER.filter((value) => issues.some((issue) => issue.field === value));
  const visible = field === "all" ? issues : issues.filter((issue) => issue.field === field);

  if (issues.length === 0) {
    return <p className="card px-6 py-14 text-center text-[15px] text-ink-muted">이 날은 발행된 이슈가 없습니다.</p>;
  }

  const chip = (value: NewsField | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={field === value}
      onClick={() => setField(value)}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 ${
        field === value ? "bg-ink text-paper" : "bg-muted text-ink-soft hover:text-ink"
      }`}
    >
      {label} <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );

  return (
    <section>
      {filterable && fields.length > 1 && (
        <div className="mb-7 flex flex-wrap gap-2" aria-label="분야">
          {chip("all", "전체", issues.length)}
          {fields.map((value) => chip(value, NEWS_FIELD_LABEL[value], issues.filter((issue) => issue.field === value).length))}
        </div>
      )}

      <div>
        {visible.map((issue) => (
          <div key={issue.key} className="border-t border-rule first:border-t-0 first:[&>article]:pt-0">
            {issue.card}
          </div>
        ))}
      </div>
    </section>
  );
}
