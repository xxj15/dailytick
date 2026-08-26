import { LogoutButton } from "@/components/auth/LogoutButton";

/**
 * `loggedIn`은 선택값이다.
 * loading.tsx는 Suspense fallback이라 그 안에서 쿠키를 읽을 수 없으므로,
 * 로그인 여부를 모르는 자리에서는 이 링크를 아예 그리지 않는다.
 */
export function Footer({ loggedIn }: { loggedIn?: boolean }) {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-6xl items-end justify-between gap-6 px-6 py-8">
        <p className="text-xs leading-relaxed text-ink-muted">
          Generated with AI from publicly available sources.
          <br />
          For educational purposes only. Not investment advice.
        </p>

        {loggedIn && <LogoutButton />}
      </div>
    </footer>
  );
}
