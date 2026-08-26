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
        {/* 영문 라벨만 두면 무슨 자리인지 읽히지 않는다. 한 줄로 설명해준다 */}
        <div>
          <h2 className="headline text-lg">오늘 기억할 한 줄</h2>
          <p className="mt-1 text-sm text-ink-muted">
            오늘 시장에서 가장 중요한 흐름을 한 문장으로 정리했다.
          </p>
        </div>

        {action}
      </div>

      {/* 오늘 금융시장을 한 문장으로 기억하게 만드는 자리 */}
      <p className="headline mt-6 max-w-3xl border-l-4 border-ink pl-5 text-2xl leading-snug sm:text-[2rem]">
        {oneLiner}
      </p>

      {generatedAt && (
        <p className="label mt-6">Generated {formatKstTime(generatedAt)}</p>
      )}
    </section>
  );
}
