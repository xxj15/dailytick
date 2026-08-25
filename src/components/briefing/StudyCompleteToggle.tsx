"use client";

import { useStudyLog } from "@/components/briefing/StudyLogProvider";
import { formatKstTime } from "@/lib/date";

/**
 * 오늘 지면을 다 읽었는지 표시한다.
 * 본문 맨 아래가 아니라 제호 바로 아래에 두어 '체크하는' 감각을 준다.
 */
export function StudyCompleteToggle() {
  const { completed, completedAt, status, toggleCompleted } = useStudyLog();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggleCompleted}
        disabled={status === "saving"}
        aria-pressed={completed}
        className={`group flex items-center gap-2.5 border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 disabled:opacity-50 ${
          completed
            ? "border-ink bg-ink text-paper"
            : "border-rule text-ink-muted hover:border-ink hover:text-ink"
        }`}
      >
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors duration-200 ${
            completed
              ? "border-paper bg-paper"
              : "border-rule group-hover:border-ink"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="square"
            className={`h-3 w-3 text-ink transition-transform duration-300 ease-out ${
              completed ? "scale-100" : "scale-0"
            }`}
          >
            <path d="M4 12.5 9.5 18 20 6" />
          </svg>
        </span>

        {completed ? "학습 완료" : "다 읽었어요"}
      </button>

      {completedAt && (
        <span className="label hidden sm:block">
          {formatKstTime(completedAt)}
        </span>
      )}
    </div>
  );
}
