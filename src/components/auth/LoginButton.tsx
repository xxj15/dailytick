"use client";

import { useState } from "react";
import { LoginDialog } from "@/components/auth/LoginDialog";

/**
 * 로그인 모달을 여는 버튼.
 * 제호 윗줄과 잠긴 메모칸에서 같은 모달을 쓴다. 모양만 프롭으로 받는다.
 */
export function LoginButton({
  className,
  children = "로그인",
}: {
  className: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <LoginDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
