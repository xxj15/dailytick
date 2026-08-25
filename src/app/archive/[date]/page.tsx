import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefingBody } from "@/components/briefing/BriefingBody";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { formatKoreanDate, isDateString } from "@/lib/date";
import { getBriefingByDate } from "@/lib/supabase/briefings";
import type { Briefing } from "@/types/briefing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/archive/[date]">) {
  const { date } = await params;
  return { title: isDateString(date) ? `${formatKoreanDate(date)} 브리핑` : "Archive" };
}

export default async function ArchiveDatePage({
  params,
}: PageProps<"/archive/[date]">) {
  const { date } = await params;

  // URL은 사용자가 직접 입력할 수 있다. 형식부터 확인한다.
  if (!isDateString(date)) notFound();

  // DB 오류로 페이지가 500이 되지 않게 한다. '없음'(404)과 '조회 실패'는 구분한다.
  let briefing: Briefing | null = null;
  let failed = false;

  try {
    briefing = await getBriefingByDate(date);
  } catch (error) {
    console.error(`[archive/${date}] 브리핑 조회 실패`, error);
    failed = true;
  }

  if (!briefing && !failed) notFound();

  return (
    <>
      <Masthead date={date} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {briefing ? (
          <BriefingBody briefing={briefing} />
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

        <div className="flex items-center justify-between border-t border-rule py-8">
          <Link href="/archive" className="label prose-link hover:text-ink">
            ← Archive
          </Link>
          <Link href="/" className="label prose-link hover:text-ink">
            오늘의 브리핑 →
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
