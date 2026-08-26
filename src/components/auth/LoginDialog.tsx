"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 아이디·비밀번호만 받는 로그인 모달.
 *
 * 사용자가 한 명뿐이라 회원가입도, 별도 로그인 페이지도 없다.
 * 읽던 지면에서 벗어나지 않도록 그 자리에서 띄운다.
 *
 * 네이티브 <dialog>를 쓰면 포커스 가둠과 Esc 닫기를 직접 만들 필요가 없다.
 */
export function LoginDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleClose() {
    setPassword("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.error ?? "로그인하지 못했습니다.");
        return;
      }

      handleClose();
      // 지면은 서버에서 로그인 여부를 읽는다. 그 자리에서 다시 그린다.
      router.refresh();
    } catch {
      setError("로그인하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      // 배경을 눌러도 닫히게 한다. (dialog 자신이 클릭 대상이면 바깥이다)
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose();
      }}
      className="m-auto w-[calc(100%-3rem)] max-w-xs rounded-xl border border-ink bg-paper p-6 text-ink backdrop:bg-ink/40"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-id" className="label">
            아이디
          </label>
          <input
            id="login-id"
            name="username"
            autoComplete="username"
            value={id}
            onChange={(event) => setId(event.target.value)}
            required
            className="mt-2 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none transition-colors duration-200 focus:border-ink focus:ring-1 focus:ring-ink"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="label">
            비밀번호
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-2 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none transition-colors duration-200 focus:border-ink focus:ring-1 focus:ring-ink"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-ink-muted">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="label flex-1 rounded-full border border-rule px-4 py-2.5 transition-colors duration-200 hover:border-ink hover:text-ink"
          >
            취소
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="label flex-1 rounded-full border border-ink bg-ink px-4 py-2.5 text-paper transition-opacity duration-200 hover:opacity-80 disabled:opacity-50"
          >
            {submitting ? "확인 중" : "로그인"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
