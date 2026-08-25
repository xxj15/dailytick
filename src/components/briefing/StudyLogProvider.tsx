"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StudyLog } from "@/types/briefing";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type StudyLogValue = {
  completed: boolean;
  completedAt: string | null;
  note: string;
  status: SaveStatus;
  dirty: boolean;
  changeNote: (next: string) => void;
  toggleCompleted: () => void;
  saveNote: () => void;
};

const StudyLogContext = createContext<StudyLogValue | null>(null);

export function useStudyLog() {
  const value = useContext(StudyLogContext);
  if (!value)
    throw new Error("useStudyLog은 StudyLogProvider 안에서만 쓸 수 있습니다.");
  return value;
}

/**
 * 완료 표시(지면 상단)와 메모(오른쪽 단)는 화면에서 떨어져 있지만
 * DB에서는 하루 한 행을 함께 쓴다. 한쪽만 저장하면 다른 쪽 값을 덮어쓰므로
 * 상태와 저장을 여기서 함께 들고 있는다.
 */
export function StudyLogProvider({
  date,
  initialLog,
  children,
}: {
  date: string;
  initialLog: StudyLog | null;
  children: ReactNode;
}) {
  const [completedAt, setCompletedAt] = useState(initialLog?.completedAt ?? null);
  const [note, setNote] = useState(initialLog?.note ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);

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
      setDirty(false);
    } catch (error) {
      console.error("[study-log] 저장 실패", error);
      setStatus("error");
    }
  }

  const value: StudyLogValue = {
    completed,
    completedAt,
    note,
    status,
    dirty,
    changeNote: (next) => {
      setNote(next);
      setDirty(true);
      setStatus("idle");
    },
    toggleCompleted: () => save(!completed, note),
    saveNote: () => save(completed, note),
  };

  return (
    <StudyLogContext.Provider value={value}>{children}</StudyLogContext.Provider>
  );
}
