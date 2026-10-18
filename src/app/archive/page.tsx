import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { isLoggedIn } from "@/lib/auth";
import {
  formatMonthLabel,
  getTodayKST,
  type DateString,
} from "@/lib/date";
import { getArchiveEntries } from "@/lib/supabase/briefings";
import { getStudyLogs } from "@/lib/supabase/study-logs";
import type { ArchiveEntry, StudyLog } from "@/types/briefing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Archive — 지난 브리핑",
};

/** 같은 달끼리 묶는다. 목록은 이미 최신순이므로 순서를 유지한다. */
function groupByMonth(entries: ArchiveEntry[]) {
  const groups: { label: string; entries: ArchiveEntry[] }[] = [];

  for (const entry of entries) {
    const label = formatMonthLabel(entry.briefingDate);
    const last = groups.at(-1);

    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  return groups;
}

function dayOfMonth(date: DateString): string {
  return date.slice(8, 10);
}

export default async function ArchivePage() {
  const today = getTodayKST();
  // 목록에는 그날 남긴 메모가 그대로 보인다. 주인일 때만 함께 조회한다.
  const canEdit = await isLoggedIn();

  let entries: ArchiveEntry[] = [];
  let logs: StudyLog[] = [];

  try {
    [entries, logs] = await Promise.all([
      getArchiveEntries(),
      canEdit ? getStudyLogs() : [],
    ]);
  } catch (error) {
    console.error("[archive] 목록 조회 실패", error);
  }

  const logByDate = new Map(logs.map((log) => [log.briefingDate, log]));

  const groups = groupByMonth(entries);

  return (
    <>
      <Masthead date={today} loggedIn={canEdit} />

      <main className="page-width flex-1">
        <section className="pt-10 pb-4">
          <h1 className="headline text-2xl sm:text-3xl">지난 브리핑</h1>
          <nav className="mt-5 flex gap-2 text-sm font-semibold">
            <span className="rounded-full bg-ink px-3.5 py-1.5 text-paper">날짜별</span>
            <Link href="/archive/knowledge" className="rounded-full bg-muted px-3.5 py-1.5 text-ink-soft hover:text-ink">
              상식별
            </Link>
          </nav>
        </section>

        {groups.length === 0 ? (
          <p className="card mt-6 px-6 py-16 text-center text-[15px] text-ink-muted">
            아직 발행된 브리핑이 없습니다.
          </p>
        ) : (
          <div className="py-12">
            {groups.map((group) => (
              <section key={group.label} className="mb-12 last:mb-0">
                <h2 className="label pb-3">{group.label}</h2>

                <ul className="card overflow-hidden">
                  {group.entries.map((entry) => {
                    const log = logByDate.get(entry.briefingDate);

                    return (
                      <li key={entry.briefingDate} className="border-b border-rule last:border-b-0">
                        <Link
                          href={`/archive/${entry.briefingDate}`}
                          className="block px-5 py-4 transition-colors duration-200 hover:bg-muted"
                        >
                          <div className="flex items-baseline gap-4 sm:gap-6">
                            <span className="w-8 shrink-0 text-lg font-bold text-primary tabular-nums">
                              {dayOfMonth(entry.briefingDate)}
                            </span>

                            <span className="text-[15px]">
                              {entry.knowledgeTitles.join(" · ") || "브리핑 보기"}
                            </span>

                            {/* 완료한 날과 오늘은 목록에서 바로 구분되어야 한다 */}
                            {log?.completedAt ? (
                              <span className="ml-auto shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-paper">
                                완료
                              </span>
                            ) : entry.briefingDate === today ? (
                              <span className="ml-auto shrink-0 rounded-full bg-primary-weak px-2.5 py-1 text-xs font-semibold text-primary">
                                Today
                              </span>
                            ) : null}
                          </div>

                          {/* 그날 남긴 메모는 목록에서 바로 보인다 */}
                          {log?.note && (
                            <p className="mt-1.5 pl-12 text-sm text-ink-muted sm:pl-14">
                              {log.note}
                            </p>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="py-8">
          <Link href="/" className="text-sm font-semibold text-primary hover:text-primary-strong">
            ← 오늘의 브리핑
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
