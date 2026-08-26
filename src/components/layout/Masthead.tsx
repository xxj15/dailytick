import Link from "next/link";
import { AuthLink } from "@/components/auth/AuthLink";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import {
  formatIssueNumber,
  formatMastheadDate,
  type DateString,
} from "@/lib/date";

/**
 * `loggedIn`은 선택값이다.
 * loading.tsx는 Suspense fallback이라 그 안에서 쿠키를 읽을 수 없으므로,
 * 로그인 여부를 모르는 자리에서는 이 링크를 아예 그리지 않는다.
 */
export function Masthead({
  date,
  loggedIn,
}: {
  date: DateString;
  loggedIn?: boolean;
}) {
  return (
    <header>
      <div className="page-width">
        {/*
          신문처럼 날짜와 호수를 지면 맨 윗줄 한가운데 둔다.
          가운데를 진짜 가운데에 세우려면 양옆 칸의 폭이 같아야 하므로
          justify-between이 아니라 1fr-auto-1fr 3단으로 짠다.

          Mobile에서는 세 덩이가 한 줄에 들어가지 않는다.
          날짜와 호수를 아래 줄로 내려 가운데에 그대로 세운다.
        */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/archive"
            className="label prose-link transition-colors duration-200 hover:text-ink"
          >
            Archive
          </Link>

          <p className="label order-last w-full text-center sm:order-none sm:w-auto">
            {formatMastheadDate(date)}
            <span aria-hidden="true" className="mx-3 text-rule">
              ·
            </span>
            {formatIssueNumber(date)}
          </p>

          {/* loading.tsx는 로그인 여부를 모른다. 빈 칸으로 가운데 정렬만 지킨다 */}
          {loggedIn === undefined ? (
            <span aria-hidden="true" />
          ) : (
            <span className="sm:justify-self-end">
              <AuthLink loggedIn={loggedIn} />
            </span>
          )}
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
