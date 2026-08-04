import { describe, expect, it } from 'vitest'
import { checkCloseFactor, repayPctForAction } from './close-factor'

describe('checkCloseFactor', () => {
  it('allows soft rebalance at 20%', () => {
    const result = checkCloseFactor({
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      proposedRepayPct: 20,
      debtUsd: 1000,
    })
    expect(result.ok).toBe(true)
    expect(result.effectiveRepayPct).toBe(20)
  })

  it('rejects soft rebalance above close factor', () => {
    const result = checkCloseFactor({
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      proposedRepayPct: 60,
      debtUsd: 1000,
      closeFactorPct: 50,
    })
    expect(result.ok).toBe(false)
    expect(result.violations[0]).toContain('CLOSE_FACTOR_EXCEEDED')
  })

  it('allows SAFE_EXIT with multi-step flag when full repay > close factor', () => {
    const result = checkCloseFactor({
      action: { type: 'SAFE_EXIT' },
      proposedRepayPct: 100,
      debtUsd: 5000,
      closeFactorPct: 50,
    })
    expect(result.ok).toBe(true)
    expect(result.rulesChecked).toContain('SAFE_EXIT_MULTI_STEP_REQUIRED')
  })

  it('NONE is always ok', () => {
    expect(
      checkCloseFactor({
        action: { type: 'NONE' },
        proposedRepayPct: 0,
        debtUsd: 0,
      }).ok,
    ).toBe(true)
  })
})

describe('repayPctForAction', () => {
  it('maps actions to percentages', () => {
    expect(repayPctForAction({ type: 'NONE' })).toBe(0)
    expect(repayPctForAction({ type: 'SOFT_REBALANCE', repayPct: 20 })).toBe(20)
    expect(repayPctForAction({ type: 'SAFE_EXIT' })).toBe(100)
  })
})
