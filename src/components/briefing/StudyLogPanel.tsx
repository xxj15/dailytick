"use client";

import { useState } from "react";
import { formatKstTime } from "@/lib/date";
import type { StudyLog } from "@/types/briefing";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * 오늘 학습을 마쳤는지 표시하고 한 줄 메모를 남긴다.
 * 저장은 항상 서버 route를 거친다. (브라우저는 Supabase에 직접 쓰지 않는다)
 */
export function StudyLogPanel({
  date,
  initialLog,
}: {
  date: string;
  initialLog: StudyLog | null;
}) {
  const [completedAt, setCompletedAt] = useState(initialLog?.completedAt ?? null);
  const [note, setNote] = useState(initialLog?.note ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");

  const completed = completedAt !== null;

  async function save(nextCompleted: boolean, nextNote: string) {
    setStatus("saving");

    try {
      const response = await fetch("/api/study-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          completed: nextCompleted,
          note: nextNote.trim() || null,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error);

      setCompletedAt(result.log.completedAt);
      setStatus("saved");
    } catch (error) {
      console.error("[study-log] 저장 실패", error);
      setStatus("error");
    }
  }

  return (
    <section className="border-t border-rule py-10">
      <div className="mx-auto max-w-3xl">
        <p className="label">오늘의 학습</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => save(!completed, note)}
            disabled={status === "saving"}
            className={`border px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              completed
                ? "border-ink bg-ink text-paper"
                : "border-ink text-ink hover:bg-ink hover:text-paper"
            }`}
          >
            {completed ? "학습 완료" : "학습 완료로 표시"}
          </button>

          {completedAt && (
            <span className="label">완료 {formatKstTime(completedAt)}</span>
          )}
        </div>

        <div className="mt-6">
          <label htmlFor="study-note" className="label">
            오늘의 메모
          </label>

          <textarea
            id="study-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setStatus("idle");
            }}
            maxLength={500}
            rows={3}
            placeholder="오늘 배운 것, 면접에서 써먹을 문장 등을 적어두세요."
            className="mt-2 w-full resize-y border border-rule bg-paper p-3 text-[15px] outline-none focus:border-ink"
          />

          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => save(completed, note)}
              disabled={status === "saving"}
              className="label border border-ink px-4 py-2 hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              저장
            </button>

            <span className="label" aria-live="polite">
              {status === "saving" && "저장 중"}
              {status === "saved" && "저장됨"}
              {status === "error" && "저장하지 못했습니다"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
