import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import {
  formatMonthLabel,
  getTodayKST,
  type DateString,
} from "@/lib/date";
import { getArchiveEntries } from "@/lib/supabase/briefings";
import type { ArchiveEntry } from "@/types/briefing";

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
  let entries: ArchiveEntry[] = [];

  try {
    entries = await getArchiveEntries();
  } catch (error) {
    console.error("[archive] 목록 조회 실패", error);
  }

  const groups = groupByMonth(entries);

  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="border-b border-rule py-12">
          <p className="label">Archive</p>
          <h1 className="headline mt-4 text-3xl">지난 브리핑</h1>
        </section>

        {groups.length === 0 ? (
          <p className="py-20 text-center text-sm text-ink-muted">
            아직 발행된 브리핑이 없습니다.
          </p>
        ) : (
          <div className="py-12">
            {groups.map((group) => (
              <section key={group.label} className="mb-12 last:mb-0">
                <h2 className="label border-b border-ink pb-2">{group.label}</h2>

                <ul>
                  {group.entries.map((entry) => (
                    <li key={entry.briefingDate} className="border-b border-rule">
                      <Link
                        href={`/archive/${entry.briefingDate}`}
                        className="flex items-baseline gap-6 py-4 hover:bg-muted"
                      >
                        <span className="headline w-8 shrink-0 text-lg tabular-nums">
                          {dayOfMonth(entry.briefingDate)}
                        </span>
                        <span className="text-[15px]">
                          {entry.knowledgeTitles.join(" · ") || "브리핑 보기"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="border-t border-rule py-8">
          <Link href="/" className="label prose-link hover:text-ink">
            ← 오늘의 브리핑
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
