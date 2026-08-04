import { describe, expect, it } from 'vitest'
import { baseToUsd, decodeHealthFactor } from './reader'

describe('decodeHealthFactor', () => {
  it('decodes ray (1e18) to float', () => {
    // 1.25 * 1e18
    const raw = 1250000000000000000n
    expect(decodeHealthFactor(raw)).toBeCloseTo(1.25, 6)
  })

  it('maps max-uint-style HF to Infinity', () => {
    const maxish = 115792089237316195423570985008687907853269984665640564039457584007913129639935n
    expect(decodeHealthFactor(maxish)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('baseToUsd', () => {
  it('decodes 8-decimal base currency', () => {
    // $15,240.00 → 1524000000000
    expect(baseToUsd(1_524_000_000_000n)).toBeCloseTo(15240, 2)
  })
})
