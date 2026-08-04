import { DEFAULT_HARD_LIMITS } from '@defi-sentinel/shared'
import { alertCircuitTripped } from '../alerts/discord'
import { getServiceSupabase } from '../supabase/client'

export interface CircuitState {
  organizationId: string
  isTripped: boolean
  failureCount: number
  lastFailureAt: string | null
  lastFailureReason: string | null
  trippedAt: string | null
}

export interface CircuitCheckResult {
  ok: boolean
  state: CircuitState
  violations: string[]
  rulesChecked: string[]
}

export type CircuitStore = {
  get: (organizationId: string) => Promise<CircuitState>
  set: (state: CircuitState) => Promise<void>
}

function emptyState(organizationId: string): CircuitState {
  return {
    organizationId,
    isTripped: false,
    failureCount: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    trippedAt: null,
  }
}

/** In-memory store for unit tests */
export function createMemoryCircuitStore(
  initial: Record<string, CircuitState> = {},
): CircuitStore {
  const map = new Map<string, CircuitState>(
    Object.entries(initial).map(([k, v]) => [k, { ...v }]),
  )
  return {
    async get(organizationId) {
      return map.get(organizationId) ?? emptyState(organizationId)
    },
    async set(state) {
      map.set(state.organizationId, { ...state })
    },
  }
}

export function createSupabaseCircuitStore(): CircuitStore {
  return {
    async get(organizationId) {
      const supabase = getServiceSupabase()
      const { data, error } = await supabase
        .from('circuit_breaker')
        .select(
          'organization_id, is_tripped, failure_count, last_failure_at, last_failure_reason, tripped_at',
        )
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (error) {
        throw new Error(`CIRCUIT_FETCH_FAILED: ${error.message}`)
      }
      if (!data) return emptyState(organizationId)

      return {
        organizationId: data.organization_id as string,
        isTripped: Boolean(data.is_tripped),
        failureCount: Number(data.failure_count ?? 0),
        lastFailureAt: (data.last_failure_at as string | null) ?? null,
        lastFailureReason: (data.last_failure_reason as string | null) ?? null,
        trippedAt: (data.tripped_at as string | null) ?? null,
      }
    },
    async set(state) {
      const supabase = getServiceSupabase()
      const { error } = await supabase.from('circuit_breaker').upsert(
        {
          organization_id: state.organizationId,
          is_tripped: state.isTripped,
          failure_count: state.failureCount,
          last_failure_at: state.lastFailureAt,
          last_failure_reason: state.lastFailureReason,
          tripped_at: state.trippedAt,
        },
        { onConflict: 'organization_id' },
      )
      if (error) {
        throw new Error(`CIRCUIT_UPDATE_FAILED: ${error.message}`)
      }
    },
  }
}

/** Pure check: reject if already tripped. */
export function checkCircuitBreaker(state: CircuitState): CircuitCheckResult {
  const rulesChecked = ['CIRCUIT_BREAKER_OPEN']
  if (state.isTripped) {
    return {
      ok: false,
      state,
      violations: [
        `CIRCUIT_BREAKER_HALT: tripped${
          state.lastFailureReason ? ` (${state.lastFailureReason})` : ''
        }`,
      ],
      rulesChecked,
    }
  }
  return { ok: true, state, violations: [], rulesChecked }
}

/**
 * Record an execution failure. Trips after maxConsecutiveFailures (default 3).
 */
export async function recordExecutionFailure(
  organizationId: string,
  reason: string,
  options: {
    maxConsecutiveFailures?: number
    store?: CircuitStore
    alert?: boolean
  } = {},
): Promise<CircuitState> {
  const store = options.store ?? createSupabaseCircuitStore()
  const max =
    options.maxConsecutiveFailures ?? DEFAULT_HARD_LIMITS.max_consecutive_failures
  const prev = await store.get(organizationId)
  const failureCount = prev.failureCount + 1
  const now = new Date().toISOString()
  const isTripped = prev.isTripped || failureCount >= max

  const next: CircuitState = {
    organizationId,
    isTripped,
    failureCount,
    lastFailureAt: now,
    lastFailureReason: reason,
    trippedAt: isTripped ? prev.trippedAt ?? now : null,
  }

  await store.set(next)

  if (isTripped && !prev.isTripped && options.alert !== false) {
    await alertCircuitTripped(organizationId, reason)
  }

  return next
}

/** Reset failure count after a successful execution. */
export async function recordExecutionSuccess(
  organizationId: string,
  store: CircuitStore = createSupabaseCircuitStore(),
): Promise<CircuitState> {
  const prev = await store.get(organizationId)
  if (prev.isTripped) {
    // Success does not auto-reset a tripped breaker — Admin must reset
    return prev
  }
  const next: CircuitState = {
    ...prev,
    failureCount: 0,
    lastFailureAt: null,
    lastFailureReason: null,
  }
  await store.set(next)
  return next
}

/** Admin path — clear trip state. */
export async function resetCircuitBreaker(
  organizationId: string,
  store: CircuitStore = createSupabaseCircuitStore(),
): Promise<CircuitState> {
  const next = emptyState(organizationId)
  await store.set(next)
  return next
}
