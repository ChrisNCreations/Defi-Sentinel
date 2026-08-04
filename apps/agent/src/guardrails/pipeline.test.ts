import { describe, expect, it } from 'vitest'
import type { PositionState } from '@defi-sentinel/shared'
import { createMemoryCircuitStore } from './circuit-breaker'
import { runGuardrails } from './pipeline'

const position = (hf = 1.2): PositionState => ({
  protocol: 'AaveV3',
  network: 'Base Sepolia',
  target_wallet: '0x0000000000000000000000000000000000000001',
  health_factor: hf,
  collateral_usd: 10_000,
  debt_usd: 8_000,
})

describe('runGuardrails pipeline', () => {
  it('Operator wallet passes soft rebalance path', async () => {
    const store = createMemoryCircuitStore()
    const result = await runGuardrails({
      actorWallet: '0xOperator',
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position: position(1.2),
      gasPriceGwei: 20,
      triggerType: 'MANUAL_OPERATOR',
      writeAudit: false,
      dryRunAudit: true,
      circuitStore: store,
      hardLimits: {
        max_repayment_pct: 30,
        max_gas_price_gwei: 50,
        max_consecutive_failures: 3,
        allowed_contracts: [],
      },
      memberLookup: async () => ({
        role: 'operator',
        organization_id: 'org-1',
      }),
    })

    expect(result.allowed).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.organizationId).toBe('org-1')
    expect(result.rulesChecked).toContain('ROLE_VALIDATION')
    expect(result.rulesChecked).toContain('CIRCUIT_BREAKER_OPEN')
  })

  it('Viewer is rejected with ROLE_INSUFFICIENT but keeps org id for audit', async () => {
    const result = await runGuardrails({
      actorWallet: '0xViewer',
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position: position(),
      gasPriceGwei: 10,
      triggerType: 'MANUAL_OPERATOR',
      writeAudit: false,
      circuitStore: createMemoryCircuitStore(),
      hardLimits: {
        max_repayment_pct: 30,
        max_gas_price_gwei: 50,
        max_consecutive_failures: 3,
        allowed_contracts: [],
      },
      memberLookup: async () => ({
        role: 'viewer',
        organization_id: 'org-1',
      }),
    })

    expect(result.allowed).toBe(false)
    expect(result.violations).toContain('ROLE_INSUFFICIENT')
    expect(result.organizationId).toBe('org-1')
  })

  it('tripped circuit stops further execution', async () => {
    const store = createMemoryCircuitStore({
      'org-1': {
        organizationId: 'org-1',
        isTripped: true,
        failureCount: 3,
        lastFailureAt: new Date().toISOString(),
        lastFailureReason: 'rpc',
        trippedAt: new Date().toISOString(),
      },
    })

    const result = await runGuardrails({
      actorWallet: '0xOp',
      action: { type: 'SAFE_EXIT' },
      position: position(1.05),
      gasPriceGwei: 10,
      triggerType: 'MANUAL_OPERATOR',
      writeAudit: false,
      circuitStore: store,
      hardLimits: {
        max_repayment_pct: 30,
        max_gas_price_gwei: 50,
        max_consecutive_failures: 3,
        allowed_contracts: [],
      },
      memberLookup: async () => ({
        role: 'operator',
        organization_id: 'org-1',
      }),
    })

    expect(result.allowed).toBe(false)
    expect(result.violations.some((v) => v.includes('CIRCUIT_BREAKER_HALT'))).toBe(true)
  })

  it('hard limit gas violation is rejected', async () => {
    const result = await runGuardrails({
      actorWallet: '0xOp',
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position: position(),
      gasPriceGwei: 99,
      triggerType: 'MANUAL_OPERATOR',
      writeAudit: false,
      circuitStore: createMemoryCircuitStore(),
      hardLimits: {
        max_repayment_pct: 30,
        max_gas_price_gwei: 50,
        max_consecutive_failures: 3,
        allowed_contracts: [],
      },
      memberLookup: async () => ({
        role: 'admin',
        organization_id: 'org-1',
      }),
    })

    expect(result.allowed).toBe(false)
    expect(result.violations.some((v) => v.startsWith('GAS_PRICE_EXCEEDED'))).toBe(true)
  })

  it('scheduled path skips role actor but requires org id', async () => {
    const missing = await runGuardrails({
      scheduled: true,
      action: { type: 'NONE' },
      position: position(2),
      gasPriceGwei: 1,
      triggerType: 'SCHEDULED_CRON',
      writeAudit: false,
      circuitStore: createMemoryCircuitStore(),
    })
    expect(missing.allowed).toBe(false)
    expect(missing.violations).toContain('ORG_ID_REQUIRED_FOR_SCHEDULED')

    const ok = await runGuardrails({
      scheduled: true,
      organizationId: 'org-1',
      action: { type: 'NONE' },
      position: position(2),
      gasPriceGwei: 1,
      triggerType: 'SCHEDULED_CRON',
      writeAudit: false,
      circuitStore: createMemoryCircuitStore(),
    })
    expect(ok.allowed).toBe(true)
  })
})
