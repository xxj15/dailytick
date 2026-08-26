"use client";

import { LoginButton } from "@/components/auth/LoginButton";
import { useStudyLog } from "@/components/briefing/StudyLogProvider";

/**
 * 읽으면서 바로 적을 수 있도록 본문 오른쪽 단에 두고 스크롤을 따라오게 한다.
 * Mobile에서는 단이 하나이므로 본문 아래로 내려간다.
 *
 * 비로그인 방문자에게는 이 자리를 잠긴 채로 보여준다.
 * 자리를 통째로 감추면 지면에 이 기능이 있다는 것 자체가 안 보인다.
 */
export function StudyNote() {
  const { canEdit, note, status, dirty, changeNote, saveNote } = useStudyLog();

  return (
    <aside className="mt-12 border-t border-rule pt-6 lg:sticky lg:top-28 lg:mt-0 lg:self-start lg:border-t-0 lg:pt-10">
      <div className="lg:border-l lg:border-rule lg:pl-6">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="study-note" className="label">
            한 줄 메모
          </label>

          <span className="label" aria-live="polite">
            {status === "saving" && "저장 중"}
            {status === "saved" && !dirty && "저장됨"}
            {status === "error" && "실패"}
          </span>
        </div>

        <textarea
          id="study-note"
          value={note}
          onChange={(event) => changeNote(event.target.value)}
          onBlur={() => {
            if (dirty) saveNote();
          }}
          disabled={!canEdit}
          maxLength={500}
          rows={8}
          placeholder={canEdit ? "메모 남기기" : "메모 기능 잠김"}
          className="mt-3 w-full resize-y rounded-lg border border-rule bg-paper p-3 text-[15px] leading-relaxed outline-none transition-colors duration-200 placeholder:text-ink-muted/60 focus:border-ink focus:ring-1 focus:ring-ink disabled:cursor-not-allowed disabled:resize-none disabled:bg-muted"
        />

        <div className="mt-3 flex items-center justify-between gap-2">
          {canEdit ? (
            <>
              <span className="label tabular-nums">{note.length} / 500</span>

              <button
                type="button"
                onClick={saveNote}
                disabled={status === "saving" || !dirty}
                className="label rounded-full border border-ink px-3.5 py-1.5 transition-colors duration-200 hover:bg-ink hover:text-paper disabled:border-rule disabled:text-ink-muted disabled:hover:bg-transparent disabled:hover:text-ink-muted"
              >
                저장
              </button>
            </>
          ) : (
            <LoginButton className="label prose-link ml-auto hover:text-ink">
              로그인 →
            </LoginButton>
          )}
        </div>
      </div>
    </aside>
  );
}
