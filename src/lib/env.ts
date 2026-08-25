import "server-only";
import { z } from "zod";

/**
 * 서버 전용 환경변수.
 * 모듈 로드 시점이 아니라 실제 사용 시점에 검증한다.
 * (빌드 타임에 값이 없어도 build 자체가 실패하지 않도록)
 */
const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY가 필요합니다."),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),

  SUPABASE_URL: z.url("SUPABASE_URL은 URL 형식이어야 합니다."),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY가 필요합니다."),

  CRON_SECRET: z.string().min(1, "CRON_SECRET이 필요합니다."),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`환경변수 설정이 올바르지 않습니다.\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** 브라우저에도 노출되는 값. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
