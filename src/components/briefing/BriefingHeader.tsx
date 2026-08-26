import { GlossaryText } from "@/components/briefing/GlossaryText";
import { formatKstTime } from "@/lib/date";
import type { ReactNode } from "react";

export function BriefingHeader({
  todayKeywords,
  oneLiner,
  generatedAt,
  action,
}: {
  todayKeywords: string[];
  oneLiner: string;
  generatedAt?: string;
  /** 오른쪽에 놓을 학습 완료 체크 등. 없으면 비워둔다 */
  action?: ReactNode;
}) {
  const hasKeywords = todayKeywords.length > 0;

  // 같은 용어가 키워드 두 개에 걸쳐 나와도 처음 한 번만 설명을 붙인다
  const explained = new Set<string>();

  return (
    <section className="border-b border-rule py-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* 키워드가 없는 지난 브리핑은 한 줄만 남으므로 제목을 걸지 않는다 */}
        {hasKeywords && <h2 className="headline text-lg">오늘의 키워드</h2>}

        {action && <div className="ml-auto">{action}</div>}
      </div>

      {/* 단어로 먼저 훑고, 왜 중요한지는 아래 한 줄이 받쳐준다 */}
      {(hasKeywords || oneLiner) && (
        <div className="mt-6 max-w-3xl border-l-4 border-ink pl-5">
          {/* 설명 상자는 이 줄을 기준으로 자리를 잡는다. 화면 밖으로 나가지 않게 */}
          {hasKeywords && (
            <ul className="relative flex flex-wrap items-baseline">
              {todayKeywords.map((keyword, index) => (
                <li
                  key={keyword}
                  className="headline text-2xl leading-snug sm:text-[1.75rem]"
                >
                  <GlossaryText
                    text={keyword}
                    used={explained}
                    idPrefix={`keyword-${index}`}
                  />
                  {index < todayKeywords.length - 1 && (
                    <span aria-hidden="true" className="mx-4 text-rule">
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {oneLiner && (
            <p
              className={`text-base leading-relaxed text-ink-muted sm:text-lg ${
                hasKeywords ? "mt-3" : ""
              }`}
            >
              {oneLiner}
            </p>
          )}
        </div>
      )}

      {generatedAt && (
        <p className="label mt-6">Generated {formatKstTime(generatedAt)}</p>
      )}
    </section>
  );
}
