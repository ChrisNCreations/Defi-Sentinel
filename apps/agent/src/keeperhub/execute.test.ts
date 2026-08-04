import { describe, expect, it, vi } from 'vitest'
import { createMemoryCircuitStore } from '../guardrails/circuit-breaker'
import { executeViaKeeperHub } from './execute'
import { KeeperHubClient } from './client'

const position = {
  protocol: 'AaveV3' as const,
  network: 'Base Sepolia' as const,
  target_wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  health_factor: 1.2,
  collateral_usd: 10_000,
  debt_usd: 8_000,
}

describe('executeViaKeeperHub', () => {
  it('aborts cleanly when gas exceeds hard cap', async () => {
    const result = await executeViaKeeperHub({
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position,
      networkId: 'base-sepolia',
      organizationId: 'org-1',
      actorWallet: position.target_wallet,
      triggerType: 'MANUAL_OPERATOR',
      effectiveRepayPct: 20,
      gasPriceGwei: 999,
      rulesChecked: ['ROLE_VALIDATION'],
      dryRun: true,
    })
    expect(result.allowed).toBe(false)
    expect(result.executionStatus).toBe('GAS_EXCEEDED')
    expect(result.violations[0]).toContain('GAS_PRICE_EXCEEDED')
  })

  it('dry-run builds payload without calling network', async () => {
    const result = await executeViaKeeperHub({
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position,
      networkId: 'base-sepolia',
      organizationId: 'org-1',
      actorWallet: position.target_wallet,
      triggerType: 'MANUAL_OPERATOR',
      effectiveRepayPct: 20,
      gasPriceGwei: 20,
      rulesChecked: ['ROLE_VALIDATION'],
      dryRun: true,
    })
    expect(result.allowed).toBe(true)
    expect(result.workflowInput?.signing).toBe('turnkey_via_keeperhub')
    expect(result.workflowInput?.repayUsd).toBe(1600)
  })

  it('uses client mock for success path', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/execute')) {
        return new Response(JSON.stringify({ executionId: 'e1', status: 'running' }), {
          status: 200,
        })
      }
      return new Response(
        JSON.stringify([
          {
            id: 'e1',
            workflowId: 'wf',
            status: 'success',
            output: { success: true },
            error: null,
          },
        ]),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const client = new KeeperHubClient({
      apiKey: 'k',
      workflowId: 'wf',
      fetchImpl,
      pollIntervalMs: 5,
      pollTimeoutMs: 1000,
    })

    const store = createMemoryCircuitStore()
    const result = await executeViaKeeperHub({
      action: { type: 'SOFT_REBALANCE', repayPct: 20 },
      position,
      networkId: 'base-sepolia',
      organizationId: 'org-1',
      actorWallet: position.target_wallet,
      triggerType: 'MANUAL_OPERATOR',
      effectiveRepayPct: 20,
      gasPriceGwei: 20,
      rulesChecked: [],
      dryRun: false,
      dryRunAudit: true,
      client,
      circuitStore: store,
    })

    expect(result.allowed).toBe(true)
    expect(result.executionStatus).toBe('CONFIRMED')
    expect(result.keeperhub?.status).toBe('success')
  })
})
