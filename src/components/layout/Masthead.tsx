import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import {
  formatIssueNumber,
  formatMastheadDate,
  type DateString,
} from "@/lib/date";

export function Masthead({ date }: { date: DateString }) {
  return (
    <header>
      <div className="mx-auto max-w-6xl px-6">
        {/* 신문처럼 날짜와 호수를 지면 맨 윗줄에 둔다 */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3">
          <p className="label">{formatMastheadDate(date)}</p>

          <Link
            href="/archive"
            className="label prose-link transition-colors duration-200 hover:text-ink"
          >
            Archive
          </Link>

          <p className="label">{formatIssueNumber(date)}</p>
        </div>

        <div className="py-8 text-center sm:py-10">
          {/* 제호를 누르면 언제나 오늘 지면으로 돌아온다 */}
          <Link href="/" className="inline-block">
            <h1 className="headline text-[2rem] uppercase tracking-[0.18em] sm:text-5xl sm:tracking-[0.22em]">
              {APP_NAME}
            </h1>
          </Link>
          <p className="label mt-3">{APP_TAGLINE}</p>
        </div>
      </div>
    </header>
  );
}
