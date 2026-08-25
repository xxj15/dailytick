import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import {
  formatIssueNumber,
  formatKoreanDate,
  formatMastheadDate,
  type DateString,
} from "@/lib/date";

export function Masthead({ date }: { date: DateString }) {
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto max-w-6xl px-6">
        <div className="border-b border-rule py-8 text-center sm:py-10">
          {/* 제호를 누르면 언제나 오늘 지면으로 돌아온다 */}
          <Link href="/" className="inline-block">
            <h1 className="headline text-[2rem] uppercase tracking-[0.18em] sm:text-5xl sm:tracking-[0.22em]">
              {APP_NAME}
            </h1>
          </Link>
          <p className="label mt-3">{APP_TAGLINE}</p>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <p className="label">{formatMastheadDate(date)}</p>
          <p className="label hidden sm:block">{formatKoreanDate(date)}</p>
          <p className="label">{formatIssueNumber(date)}</p>
        </div>
      </div>
    </header>
  );
}
