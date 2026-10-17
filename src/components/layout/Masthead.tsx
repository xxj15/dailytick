import Link from "next/link";
import { AuthLink } from "@/components/auth/AuthLink";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import {
  formatIssueNumber,
  formatKoreanDate,
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
  // 제호의 마지막 단어만 한 단계 옅게 둔다 (Daily *Tick*)
  const [lead, ...rest] = APP_NAME.split(" ");

  return (
    <>
      {/* 스크롤해도 제호와 메뉴는 위에 붙어 있다. body 바로 아래에 있어야 끝까지 붙는다 */}
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="page-width flex h-14 items-center justify-between gap-4">
          {/* 제호를 누르면 언제나 오늘 지면으로 돌아온다 */}
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            {lead}
            {rest.length > 0 && <span className="text-ink-muted"> {rest.join(" ")}</span>}
          </Link>

          <nav className="flex items-center gap-5 text-[15px] font-medium text-ink-muted">
            <Link href="/archive" className="transition-colors duration-200 hover:text-ink">
              Archive
            </Link>
            {/* loading.tsx는 로그인 여부를 모른다 */}
            {loggedIn !== undefined && <AuthLink loggedIn={loggedIn} />}
          </nav>
        </div>
      </header>

      <div className="page-width pt-10 sm:pt-14">
        <p className="text-sm font-semibold text-primary">{APP_TAGLINE}</p>
        <p className="headline mt-2 text-[1.75rem] sm:text-4xl">
          {formatKoreanDate(date)}
        </p>
        <p className="label mt-2 tabular-nums">{formatIssueNumber(date)}</p>
      </div>
    </>
  );
}
