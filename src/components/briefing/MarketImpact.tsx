import type { MarketImpact as MarketImpactType } from "@/types/briefing";

const IMPACT_LABELS: Record<keyof MarketImpactType, string> = {
  stocks: "Stocks",
  rates: "Rates",
  fx: "FX",
  industry: "Industry",
};

const IMPACT_ORDER = ["stocks", "rates", "fx", "industry"] as const;

export function MarketImpact({ impact }: { impact: MarketImpactType }) {
  // 관련 있는 항목만 출력한다. 모든 자산을 억지로 채우지 않는다.
  const entries = IMPACT_ORDER.filter((key) => impact[key]).map((key) => ({
    key,
    label: IMPACT_LABELS[key],
    value: impact[key] as string,
  }));

  if (entries.length === 0) return null;

  return (
    <div className="article-body mt-6 border-t border-rule pt-4">
      <p className="label">Market Impact</p>

      {/* Mobile은 라벨 아래에 본문, Desktop은 2열 표 */}
      <dl className="mt-3 divide-y divide-rule">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="py-2.5 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[5rem_1fr] sm:gap-4"
          >
            <dt className="label sm:pt-[3px]">{entry.label}</dt>
            <dd className="mt-1 text-sm sm:mt-0">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
