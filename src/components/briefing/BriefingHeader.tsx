import { formatKstTime } from "@/lib/date";
import type { ReactNode } from "react";

export function BriefingHeader({
  todayKeywords,
  generatedAt,
  action,
}: {
  todayKeywords: string[];
  generatedAt?: string;
  /** 오른쪽에 놓을 학습 완료 체크 등. 없으면 비워둔다 */
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-rule py-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* 영문 라벨만 두면 무슨 자리인지 읽히지 않는다. 한 줄로 설명해준다 */}
        {todayKeywords.length > 0 && (
          <div>
            <h2 className="headline text-lg">오늘의 키워드</h2>
            <p className="mt-1 text-sm text-ink-muted">
              오늘 시장을 움직인 단어들이다.
            </p>
          </div>
        )}

        {action && <div className="ml-auto">{action}</div>}
      </div>

      {/* 오늘 지면을 여는 자리. 문장 대신 단어로 한눈에 훑게 한다 */}
      {todayKeywords.length > 0 && (
        <ul className="mt-6 flex max-w-3xl flex-wrap items-baseline border-l-4 border-ink pl-5">
          {todayKeywords.map((keyword, index) => (
            <li
              key={keyword}
              className="headline text-2xl leading-snug sm:text-[2rem]"
            >
              {keyword}
              {index < todayKeywords.length - 1 && (
                <span aria-hidden="true" className="mx-4 text-ink-muted">
                  ·
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {generatedAt && (
        <p className="label mt-6">Generated {formatKstTime(generatedAt)}</p>
      )}
    </section>
  );
}
