import { describe, expect, it, vi } from 'vitest'
import type { PositionState } from '@defi-sentinel/shared'
import { runCycle } from './run-cycle'

vi.mock('../aave/reader', () => ({
  getPositionState: vi.fn(async (): Promise<PositionState> => {
    throw new Error('should not call RPC when mockHf set')
  }),
}))

vi.mock('../brain/gemini', () => ({
  createGeminiClient: () => ({
    configured: false,
    runBrain: async () => ({
      formulaAction: { type: 'NONE' as const },
      resolvedAction: { type: 'NONE' as const },
      intent: { kind: 'REBALANCE_IF_NEEDED' as const, confidence: 1 },
      gas: { gasPriceGwei: 15, source: 'fallback' as const },
      llmReasoning: {
        model: 'test',
        thought_summary: 'position healthy',
        proposed_tool_call: 'none',
      },
      revalidated: false,
      notes: [],
    }),
  }),
}))

vi.mock('../guardrails/pipeline', () => ({
  runGuardrails: vi.fn(async (ctx: { action: { type: string }; organizationId?: string }) => ({
    allowed: true,
    violations: [],
    rulesChecked: ['ROLE_VALIDATION_SKIPPED_SCHEDULED'],
    role: null,
    organizationId: ctx.organizationId ?? 'org-1',
    effectiveRepayPct: 0,
    auditExecutionId: 'audit-none-1',
  })),
}))

vi.mock('../keeperhub/execute', () => ({
  executeViaKeeperHub: vi.fn(async () => {
    throw new Error('should not execute for NONE')
  }),
}))

describe('runCycle', () => {
  it('scheduled NONE path audits and does not call KeeperHub', async () => {
    const logs: string[] = []
    const result = await runCycle({
      network: 'base-sepolia',
      targetWallet: '0x0000000000000000000000000000000000000001',
      organizationId: 'org-1',
      triggerType: 'SCHEDULED_CRON',
      scheduled: true,
      mockHf: 1.5,
      gasGwei: 20,
      useBrain: true,
      execute: true,
      dryRunKeeper: true,
      dryRunAudit: true,
      writeAudit: true,
      transport: 'rest',
      log: (l) => logs.push(l),
    })

    expect(result.ok).toBe(true)
    expect(result.finalAction?.type).toBe('NONE')
    expect(result.softFailure).toBeUndefined()
    expect(result.exec).toBeUndefined()
    expect(logs.some((l) => l.includes('NONE'))).toBe(true)
  })

  it('returns softFailure on invalid target without mock', async () => {
    const result = await runCycle({
      network: 'base-sepolia',
      targetWallet: 'not-an-address',
      organizationId: 'org-1',
      triggerType: 'SCHEDULED_CRON',
      scheduled: true,
      gasGwei: 20,
      useBrain: false,
      execute: false,
      dryRunKeeper: true,
      dryRunAudit: true,
      writeAudit: false,
      transport: 'rest',
      log: () => {},
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/invalid target/i)
  })

  it('force-soft overrides formula when HF is healthy', async () => {
    const { runGuardrails } = await import('../guardrails/pipeline')
    const result = await runCycle({
      network: 'base-sepolia',
      targetWallet: '0x0000000000000000000000000000000000000001',
      organizationId: 'org-1',
      actorWallet: '0x00000000000000000000000000000000000000aa',
      triggerType: 'MANUAL_OPERATOR',
      mockHf: 2.0,
      gasGwei: 10,
      useBrain: false,
      forceMode: 'force-soft',
      execute: false,
      dryRunKeeper: true,
      dryRunAudit: true,
      writeAudit: false,
      transport: 'rest',
      log: () => {},
    })

    expect(result.ok).toBe(true)
    expect(result.finalAction?.type).toBe('SOFT_REBALANCE')
    expect(vi.mocked(runGuardrails)).toHaveBeenCalled()
  })
})
