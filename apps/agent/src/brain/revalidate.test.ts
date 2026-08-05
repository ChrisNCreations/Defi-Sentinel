import { describe, expect, it } from 'vitest'
import {
  clampGasEstimate,
  parseIntentKind,
  parseJsonObject,
  resolveActionFromIntent,
} from './revalidate'

describe('resolveActionFromIntent', () => {
  const formulaSoft = { type: 'SOFT_REBALANCE' as const, repayPct: 20 as const }
  const formulaNone = { type: 'NONE' as const }

  it('REBALANCE_IF_NEEDED follows formula', () => {
    expect(
      resolveActionFromIntent(formulaSoft, { kind: 'REBALANCE_IF_NEEDED', confidence: 1 }).action,
    ).toEqual(formulaSoft)
    expect(
      resolveActionFromIntent(formulaNone, { kind: 'REBALANCE_IF_NEEDED', confidence: 1 }).action
        .type,
    ).toBe('NONE')
  })

  it('FORCE_SOFT uses policy % not formula', () => {
    const r = resolveActionFromIntent(formulaNone, { kind: 'FORCE_SOFT', confidence: 1 })
    expect(r.action).toEqual({ type: 'SOFT_REBALANCE', repayPct: 20 })
  })

  it('CHECK_STATUS never executes', () => {
    expect(
      resolveActionFromIntent(formulaSoft, { kind: 'CHECK_STATUS', confidence: 1 }).action.type,
    ).toBe('NONE')
  })

  it('Gemini cannot invent repay pct — FORCE_SAFE is full exit only', () => {
    expect(
      resolveActionFromIntent(formulaSoft, { kind: 'FORCE_SAFE', confidence: 1 }).action.type,
    ).toBe('SAFE_EXIT')
  })
})

describe('clampGasEstimate', () => {
  it('clamps above hard cap', () => {
    const { gas, notes } = clampGasEstimate(
      { gasPriceGwei: 99, source: 'gemini' },
      50,
    )
    expect(gas.gasPriceGwei).toBe(50)
    expect(notes.some((n) => n.includes('clamped'))).toBe(true)
  })

  it('falls back invalid gas', () => {
    const { gas } = clampGasEstimate({ gasPriceGwei: NaN, source: 'gemini' }, 50)
    expect(gas.gasPriceGwei).toBe(1)
  })
})

describe('parse helpers', () => {
  it('parseIntentKind', () => {
    expect(parseIntentKind('rebalance_if_needed')).toBe('REBALANCE_IF_NEEDED')
    expect(parseIntentKind('nope')).toBe('UNKNOWN')
  })

  it('parseJsonObject from fenced text', () => {
    const o = parseJsonObject('```json\n{"kind":"FORCE_SOFT","confidence":0.9}\n```')
    expect(o?.kind).toBe('FORCE_SOFT')
  })
})
