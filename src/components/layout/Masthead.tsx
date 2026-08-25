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
      <div className="mx-auto max-w-5xl px-6">
        <div className="border-b border-rule py-10 text-center">
          <h1 className="headline text-4xl tracking-[0.22em] sm:text-5xl">
            {APP_NAME}
          </h1>
          <p className="label mt-3">{APP_TAGLINE}</p>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
          <p className="label">{formatMastheadDate(date)}</p>
          <p className="label hidden sm:block">{formatKoreanDate(date)}</p>
          <p className="label">{formatIssueNumber(date)}</p>
        </div>
      </div>
    </header>
  );
}
