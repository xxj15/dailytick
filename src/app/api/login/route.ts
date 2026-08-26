import { z } from "zod";
import { createSession, destroySession, verifyCredentials } from "@/lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().min(1, "아이디를 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  try {
    if (!verifyCredentials(parsed.data.id, parsed.data.password)) {
      // 아이디가 틀린 건지 비밀번호가 틀린 건지 알려주지 않는다.
      return Response.json(
        { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    await createSession();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[login] 로그인 실패", error);
    return Response.json(
      { ok: false, error: "로그인을 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await destroySession();
  return Response.json({ ok: true });
}
