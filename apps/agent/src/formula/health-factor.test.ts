import { describe, expect, it } from 'vitest'
import {
  HF_SAFE_EXIT,
  HF_SOFT_REBALANCE,
  SOFT_REBALANCE_REPAY_PCT,
} from '@defi-sentinel/shared'
import { buildDecision, decideAction, explainDecision } from './health-factor'

describe('decideAction (deterministic formula)', () => {
  it('returns NONE when HF is above soft threshold', () => {
    expect(decideAction(1.31).type).toBe('NONE')
    expect(decideAction(2).type).toBe('NONE')
    expect(decideAction(100).type).toBe('NONE')
  })

  it('returns SOFT_REBALANCE at and just below 1.30', () => {
    const at = decideAction(HF_SOFT_REBALANCE)
    expect(at).toEqual({ type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT })

    const below = decideAction(1.2)
    expect(below).toEqual({ type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT })
  })

  it('returns SAFE_EXIT at and below 1.10', () => {
    expect(decideAction(HF_SAFE_EXIT).type).toBe('SAFE_EXIT')
    expect(decideAction(1.0).type).toBe('SAFE_EXIT')
    expect(decideAction(0.5).type).toBe('SAFE_EXIT')
  })

  it('prefers SAFE_EXIT over SOFT_REBALANCE when both thresholds match', () => {
    // 1.10 is also ≤ 1.30 — safe exit must win
    expect(decideAction(1.1).type).toBe('SAFE_EXIT')
  })

  it('treats infinite / no-debt HF as NONE', () => {
    expect(decideAction(Number.POSITIVE_INFINITY).type).toBe('NONE')
    expect(decideAction(1e12).type).toBe('NONE')
  })

  it('treats non-finite numbers as NONE', () => {
    expect(decideAction(Number.NaN).type).toBe('NONE')
  })
})

describe('explainDecision', () => {
  it('includes thresholds in human-readable reason', () => {
    expect(explainDecision({ type: 'NONE' }, 1.5)).toContain('NONE')
    expect(
      explainDecision({ type: 'SOFT_REBALANCE', repayPct: SOFT_REBALANCE_REPAY_PCT }, 1.25),
    ).toContain('SOFT_REBALANCE')
    expect(explainDecision({ type: 'SAFE_EXIT' }, 1.05)).toContain('SAFE_EXIT')
  })
})

describe('buildDecision', () => {
  it('attaches action + reason to position snapshot', () => {
    const result = buildDecision({
      protocol: 'AaveV3',
      network: 'Base Sepolia',
      target_wallet: '0x0000000000000000000000000000000000000001',
      health_factor: 1.15,
      collateral_usd: 1000,
      debt_usd: 800,
    })

    expect(result.action.type).toBe('SOFT_REBALANCE')
    expect(result.position.debt_usd).toBe(800)
    expect(result.reason).toMatch(/SOFT_REBALANCE/)
  })
})
