import { describe, expect, it } from 'vitest'
import {
  checkCircuitBreaker,
  createMemoryCircuitStore,
  recordExecutionFailure,
  recordExecutionSuccess,
  resetCircuitBreaker,
} from './circuit-breaker'

describe('checkCircuitBreaker', () => {
  it('passes when not tripped', () => {
    const result = checkCircuitBreaker({
      organizationId: 'org',
      isTripped: false,
      failureCount: 1,
      lastFailureAt: null,
      lastFailureReason: null,
      trippedAt: null,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects when tripped', () => {
    const result = checkCircuitBreaker({
      organizationId: 'org',
      isTripped: true,
      failureCount: 3,
      lastFailureAt: new Date().toISOString(),
      lastFailureReason: 'sim failed',
      trippedAt: new Date().toISOString(),
    })
    expect(result.ok).toBe(false)
    expect(result.violations[0]).toContain('CIRCUIT_BREAKER_HALT')
  })
})

describe('recordExecutionFailure / success', () => {
  it('trips after 3 consecutive failures', async () => {
    const store = createMemoryCircuitStore()
    const org = 'org-trip'

    await recordExecutionFailure(org, 'fail-1', { store, alert: false, maxConsecutiveFailures: 3 })
    await recordExecutionFailure(org, 'fail-2', { store, alert: false, maxConsecutiveFailures: 3 })
    const third = await recordExecutionFailure(org, 'fail-3', {
      store,
      alert: false,
      maxConsecutiveFailures: 3,
    })

    expect(third.failureCount).toBe(3)
    expect(third.isTripped).toBe(true)

    const check = checkCircuitBreaker(third)
    expect(check.ok).toBe(false)
  })

  it('resets failure count on success when not tripped', async () => {
    const store = createMemoryCircuitStore()
    const org = 'org-ok'
    await recordExecutionFailure(org, 'fail-1', { store, alert: false })
    const after = await recordExecutionSuccess(org, store)
    expect(after.failureCount).toBe(0)
    expect(after.isTripped).toBe(false)
  })

  it('does not auto-clear a tripped breaker on success', async () => {
    const store = createMemoryCircuitStore({
      org: {
        organizationId: 'org',
        isTripped: true,
        failureCount: 3,
        lastFailureAt: 'x',
        lastFailureReason: 'x',
        trippedAt: 'x',
      },
    })
    const after = await recordExecutionSuccess('org', store)
    expect(after.isTripped).toBe(true)
  })

  it('resetCircuitBreaker clears trip', async () => {
    const store = createMemoryCircuitStore()
    const org = 'org-reset'
    await recordExecutionFailure(org, 'a', { store, alert: false, maxConsecutiveFailures: 1 })
    const reset = await resetCircuitBreaker(org, store)
    expect(reset.isTripped).toBe(false)
    expect(reset.failureCount).toBe(0)
  })
})
