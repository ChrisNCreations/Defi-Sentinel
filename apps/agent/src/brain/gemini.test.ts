import { describe, expect, it } from 'vitest'
import { createGeminiClient, heuristicIntent } from './gemini'
import type { BrainContext } from './types'

const baseCtx = (): BrainContext => ({
  position: {
    protocol: 'AaveV3',
    network: 'Base Sepolia',
    target_wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    health_factor: 1.15,
    collateral_usd: 10_000,
    debt_usd: 8_000,
  },
  formulaAction: { type: 'SOFT_REBALANCE', repayPct: 20 },
  networkLabel: 'Base Sepolia',
  hardGasCapGwei: 50,
  softRepayPct: 20,
  operatorMessage: 'repay 20% if needed',
})

describe('heuristicIntent', () => {
  it('detects rebalance if needed', () => {
    expect(heuristicIntent('repay 20% if needed').kind).toBe('REBALANCE_IF_NEEDED')
  })
  it('detects force safe exit', () => {
    expect(heuristicIntent('emergency safe exit now').kind).toBe('FORCE_SAFE')
  })
})

describe('GeminiClient.runBrain (mocked)', () => {
  it('revalidates gas over cap and uses formula for REBALANCE_IF_NEEDED', async () => {
    const client = createGeminiClient({
      generateText: async (prompt) => {
        if (prompt.includes('estimate EVM gas')) {
          return JSON.stringify({ gasPriceGwei: 200, priorityFeeGwei: 1, rationale: 'high' })
        }
        if (prompt.includes('interpret an Operator')) {
          return JSON.stringify({
            kind: 'REBALANCE_IF_NEEDED',
            confidence: 0.95,
            note: 'ok',
          })
        }
        return 'Operator asked to rebalance if needed; formula soft rebalance selected.'
      },
    })

    const result = await client.runBrain(baseCtx())
    expect(result.resolvedAction.type).toBe('SOFT_REBALANCE')
    expect(result.gas.gasPriceGwei).toBe(50) // clamped
    expect(result.llmReasoning.model).toBeTruthy()
    expect(result.llmReasoning.thought_summary.length).toBeGreaterThan(10)
    expect(result.llmReasoning.proposed_tool_call).toContain('soft_rebalance')
    expect(result.notes.some((n) => n.includes('clamped'))).toBe(true)
  })

  it('CHECK_STATUS forces NONE even if formula says soft', async () => {
    const client = createGeminiClient({
      generateText: async (prompt) => {
        if (prompt.includes('estimate EVM gas')) {
          return '{"gasPriceGwei":1,"priorityFeeGwei":0.1}'
        }
        if (prompt.includes('interpret an Operator')) {
          return '{"kind":"CHECK_STATUS","confidence":1}'
        }
        return 'Status check only.'
      },
    })
    const result = await client.runBrain({
      ...baseCtx(),
      operatorMessage: 'just check status',
    })
    expect(result.resolvedAction.type).toBe('NONE')
  })
})
