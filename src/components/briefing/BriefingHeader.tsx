import { formatKstTime } from "@/lib/date";

export function BriefingHeader({
  oneLiner,
  generatedAt,
}: {
  oneLiner: string;
  generatedAt?: string;
}) {
  return (
    <section className="border-b border-rule py-12">
      <p className="label">Today&apos;s Takeaway</p>

      {/* 오늘 금융시장을 한 문장으로 기억하게 만드는 자리 */}
      <blockquote className="headline mt-5 text-2xl leading-snug sm:text-3xl">
        {oneLiner}
      </blockquote>

      {generatedAt && (
        <p className="label mt-6">Generated {formatKstTime(generatedAt)}</p>
      )}
    </section>
  );
}
