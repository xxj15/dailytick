"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 로그인 진입은 잠긴 메모칸에만 둔다. 여기는 나갈 때만 쓰는 자리다. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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
      className="label prose-link shrink-0 transition-colors duration-200 hover:text-ink disabled:opacity-50"
    >
      로그아웃
    </button>
  );
}
