import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthEnv } from "@/lib/env";

/**
 * 단일 사용자 로그인.
 *
 * 브리핑 자체는 누구나 읽을 수 있고, 학습 기록(완료 표시·메모)만 주인이 쓴다.
 * 사용자가 한 명뿐이라 회원 테이블도, 외부 Auth 라이브러리도 두지 않는다.
 * 계정은 환경변수에 있고, 세션은 HMAC으로 서명한 쿠키 하나가 전부다.
 */

const COOKIE_NAME = "dt_session";
const SESSION_DAYS = 30;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * 길이가 달라도 안전하게 비교한다.
 * timingSafeEqual은 길이가 다르면 예외를 던지므로 해시를 거쳐 길이를 맞춘다.
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

/** 아이디와 비밀번호가 모두 맞아야 한다. 설정이 없으면 예외를 던진다. */
export function verifyCredentials(id: string, password: string): boolean {
  const env = getAuthEnv();

  // 어느 쪽이 틀렸는지 응답 시간으로 드러나지 않도록 둘 다 비교한다.
  const idMatches = safeEqual(id, env.AUTH_ID);
  const passwordMatches = safeEqual(password, env.AUTH_PASSWORD);

  return idMatches && passwordMatches;
}

export async function createSession(): Promise<void> {
  const env = getAuthEnv();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const payload = Buffer.from(
    JSON.stringify({ id: env.AUTH_ID, exp: expiresAt.getTime() }),
  ).toString("base64url");

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload, env.AUTH_SECRET)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * 로그인 상태 확인. 페이지마다 호출되므로 절대 예외를 던지지 않는다.
 *
 * 인증 환경변수가 없으면 false를 돌려준다.
 * 설정이 빠졌을 때 열리는 쪽이 아니라 잠기는 쪽으로 실패해야 한다.
 */
export async function isLoggedIn(): Promise<boolean> {
  let secret: string;

  try {
    secret = getAuthEnv().AUTH_SECRET;
  } catch {
    return false;
  }

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!safeEqual(signature, sign(payload, secret))) return false;

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
