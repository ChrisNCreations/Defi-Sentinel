import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Service-role Supabase client (agent only).
 * Used for organization_members / hard_limits / circuit_breaker / audit_logs INSERT.
 */
export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for guardrails/audit (Phase 3+)',
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/** Test helper — clear singleton between tests */
export function resetServiceSupabaseCache() {
  cached = null
}
