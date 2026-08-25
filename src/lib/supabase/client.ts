import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Supabase는 서버에서만 접근한다.
 *
 * Browser → Next.js Server → Supabase
 *
 * Service Role Key는 절대 클라이언트로 내려가지 않는다.
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const env = getServerEnv();

  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
