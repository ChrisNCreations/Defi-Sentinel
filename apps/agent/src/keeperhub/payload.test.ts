import { describe, expect, it } from 'vitest'
import { mapActionToWorkflowInput, validateWorkflowInput } from './payload'

const baseParams = {
  position: {
    protocol: 'AaveV3' as const,
    network: 'Base Sepolia' as const,
    target_wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    health_factor: 1.2,
    collateral_usd: 10_000,
    debt_usd: 8_000,
  },
  networkId: 'base-sepolia' as const,
  chainId: 84532,
  aavePoolAddress: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  maxGasPriceGwei: 50,
  effectiveRepayPct: 20,
  actorWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  triggerType: 'MANUAL_OPERATOR' as const,
  executionId: 'test-exec-1',
}

describe('mapActionToWorkflowInput', () => {
  it('maps SOFT_REBALANCE with repay usd', () => {
    const input = mapActionToWorkflowInput({
      ...baseParams,
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    })
    expect(input.action).toBe('SOFT_REBALANCE')
    expect(input.repayPct).toBe(20)
    expect(input.repayUsd).toBe(1600)
    expect(input.signing).toBe('turnkey_via_keeperhub')
    expect(input.chainId).toBe(84532)
  })

  it('maps SAFE_EXIT to 100%', () => {
    const input = mapActionToWorkflowInput({
      ...baseParams,
      action: { type: 'SAFE_EXIT' },
      effectiveRepayPct: 100,
    })
    expect(input.action).toBe('SAFE_EXIT')
    expect(input.repayPct).toBe(100)
    expect(input.repayUsd).toBe(8000)
  })

  it('never includes private key fields', () => {
    const input = mapActionToWorkflowInput({
      ...baseParams,
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    })
    const json = JSON.stringify(input)
    expect(json).not.toMatch(/privateKey|mnemonic|seed/i)
  })
})

describe('validateWorkflowInput', () => {
  it('accepts valid soft rebalance payload', () => {
    const input = mapActionToWorkflowInput({
      ...baseParams,
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
    })
    expect(validateWorkflowInput(input)).toEqual([])
  })

  it('rejects soft rebalance over close factor', () => {
    const input = mapActionToWorkflowInput({
      ...baseParams,
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      effectiveRepayPct: 60,
    })
    expect(validateWorkflowInput(input)).toContain('INVALID_REPAY_PCT_FOR_SOFT')
  })
})
