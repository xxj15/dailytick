"use client";

import { useEffect } from "react";

/**
 * 렌더링 중 예외가 나도 흰 화면을 보여주지 않는다.
 * Masthead는 서버에서 렌더된 layout 밖에 있으므로 이 경계는 본문만 대체한다.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-24 text-center">
      <p className="label">Error</p>

      <p className="headline mt-4 text-xl sm:text-2xl">
        화면을 불러오지 못했습니다.
      </p>

      <div className="mt-8">
        <button
          type="button"
          onClick={retry}
          className="label border border-ink px-5 py-2.5 hover:bg-ink hover:text-paper"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
