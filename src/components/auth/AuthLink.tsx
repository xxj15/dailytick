"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginButton } from "@/components/auth/LoginButton";

/**
 * 제호 윗줄의 로그인/로그아웃.
 * 본문 링크가 아니라 지면 기물이므로 밑줄 없이 라벨로만 둔다.
 */
const LINK_CLASS =
  "label shrink-0 transition-colors duration-200 hover:text-ink disabled:opacity-50";

export function AuthLink({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!loggedIn) return <LoginButton className={LINK_CLASS} />;

  async function handleLogout() {
    setPending(true);

    try {
      await fetch("/api/login", { method: "DELETE" });
      // 서버 컴포넌트가 로그인 여부를 다시 읽도록 지면을 새로 그린다.
      router.refresh();
    } catch (error) {
      console.error("[auth] 로그아웃 실패", error);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={LINK_CLASS}
    >
      로그아웃
    </button>
  );
}
