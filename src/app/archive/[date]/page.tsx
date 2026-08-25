import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefingBody } from "@/components/briefing/BriefingBody";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { formatKoreanDate, isDateString, type DateString } from "@/lib/date";
import {
  getAdjacentBriefingDates,
  getBriefingByDate,
} from "@/lib/supabase/briefings";
import { getStudyLog } from "@/lib/supabase/study-logs";
import type { Briefing, StudyLog } from "@/types/briefing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/archive/[date]">) {
  const { date } = await params;
  return {
    title: isDateString(date) ? `${formatKoreanDate(date)} 브리핑` : "Archive",
  };
}

export default async function ArchiveDatePage({
  params,
}: PageProps<"/archive/[date]">) {
  const { date } = await params;

  // URL은 사용자가 직접 입력할 수 있다. 형식부터 확인한다.
  if (!isDateString(date)) notFound();

  // DB 오류로 페이지가 500이 되지 않게 한다. '없음'(404)과 '조회 실패'는 구분한다.
  let briefing: Briefing | null = null;
  let studyLog: StudyLog | null = null;
  let failed = false;

  try {
    briefing = await getBriefingByDate(date);
    if (briefing) studyLog = await getStudyLog(date);
  } catch (error) {
    console.error(`[archive/${date}] 브리핑 조회 실패`, error);
    failed = true;
  }

  if (!briefing && !failed) notFound();

  // 이동 링크는 부가 기능이다. 실패해도 본문은 그대로 보여준다.
  let adjacent: { prev: DateString | null; next: DateString | null } = {
    prev: null,
    next: null,
  };

  try {
    adjacent = await getAdjacentBriefingDates(date);
  } catch (error) {
    console.error(`[archive/${date}] 인접 호 조회 실패`, error);
  }

  return (
    <>
      <Masthead date={date} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {briefing ? (
          <BriefingBody briefing={briefing} studyLog={studyLog} />
        ) : (
          <section className="border-b border-rule py-20 text-center">
            <p className="headline text-xl sm:text-2xl">
              브리핑을 불러오지 못했습니다.
            </p>
            <p className="mt-3 text-sm text-ink-muted">
              잠시 후 다시 확인해주세요.
            </p>
          </section>
        )}

        <nav className="flex items-center justify-between gap-4 border-t border-rule py-8">
          <span className="flex-1">
            {adjacent.prev && (
              <Link
                href={`/archive/${adjacent.prev}`}
                className="label prose-link hover:text-ink"
              >
                ← 이전 호
              </Link>
            )}
          </span>

          <Link href="/archive" className="label prose-link hover:text-ink">
            Archive
          </Link>

          <span className="flex-1 text-right">
            {adjacent.next && (
              <Link
                href={`/archive/${adjacent.next}`}
                className="label prose-link hover:text-ink"
              >
                다음 호 →
              </Link>
            )}
          </span>
        </nav>
      </main>

      <Footer />
    </>
  );
}
