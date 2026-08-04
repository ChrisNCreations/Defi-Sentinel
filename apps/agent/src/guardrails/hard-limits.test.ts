import { describe, expect, it } from 'vitest'
import { checkHardLimits, defaultHardLimits } from './hard-limits'

describe('checkHardLimits', () => {
  const limits = defaultHardLimits()

  it('passes within limits', () => {
    const result = checkHardLimits({
      proposedRepayPct: 20,
      gasPriceGwei: 30,
      limits,
    })
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('rejects repay above max_repayment_pct', () => {
    const result = checkHardLimits({
      proposedRepayPct: 50,
      gasPriceGwei: 10,
      limits: { ...limits, max_repayment_pct: 30 },
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.startsWith('REPAY_PCT_EXCEEDED'))).toBe(true)
  })

  it('rejects gas above max_gas_price_gwei', () => {
    const result = checkHardLimits({
      proposedRepayPct: 20,
      gasPriceGwei: 80,
      limits: { ...limits, max_gas_price_gwei: 50 },
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.startsWith('GAS_PRICE_EXCEEDED'))).toBe(true)
  })

  it('rejects disallowed contract when allowlist non-empty', () => {
    const result = checkHardLimits({
      proposedRepayPct: 20,
      gasPriceGwei: 10,
      targetContract: '0xbad',
      limits: {
        ...limits,
        allowed_contracts: ['0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27'],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.startsWith('CONTRACT_NOT_ALLOWED'))).toBe(true)
  })

  it('allows contract on allowlist (case-insensitive)', () => {
    const pool = '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27'
    const result = checkHardLimits({
      proposedRepayPct: 20,
      gasPriceGwei: 10,
      targetContract: pool.toLowerCase(),
      limits: { ...limits, allowed_contracts: [pool] },
    })
    expect(result.ok).toBe(true)
  })
})
