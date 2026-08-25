import { formatKstTime } from "@/lib/date";
import type { ReactNode } from "react";

export function BriefingHeader({
  oneLiner,
  generatedAt,
  action,
}: {
  oneLiner: string;
  generatedAt?: string;
  /** 오른쪽에 놓을 학습 완료 체크 등. 없으면 비워둔다 */
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-rule py-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <p className="label">Today&apos;s Takeaway</p>
        {action}
      </div>

      {/* 오늘 금융시장을 한 문장으로 기억하게 만드는 자리 */}
      <blockquote className="headline mt-5 max-w-3xl text-2xl leading-snug sm:text-[2rem]">
        &ldquo;{oneLiner}&rdquo;
      </blockquote>

      {generatedAt && (
        <p className="label mt-6">Generated {formatKstTime(generatedAt)}</p>
      )}
    </section>
  );
}
