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
    <div className="mt-6 border-t border-rule pt-4">
      <p className="label">Market Impact</p>
      <dl className="mt-3 space-y-2">
        {entries.map((entry) => (
          <div key={entry.key} className="flex gap-4">
            <dt className="label w-20 shrink-0 pt-[3px]">{entry.label}</dt>
            <dd className="text-sm">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
