import { describe, expect, it, vi } from 'vitest'
import { KeeperHubClient, KeeperHubError } from './client'
import type { KeeperHubWorkflowInput } from './types'

const sampleInput: KeeperHubWorkflowInput = {
  action: 'SOFT_REBALANCE',
  repayPct: 20,
  network: 'base-sepolia',
  networkLabel: 'Base Sepolia',
  chainId: 84532,
  targetWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  healthFactor: 1.2,
  collateralUsd: 10000,
  debtUsd: 8000,
  repayUsd: 1600,
  maxGasPriceGwei: 50,
  aavePoolAddress: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  triggerType: 'MANUAL_OPERATOR',
  executionId: 'exec-1',
  signing: 'turnkey_via_keeperhub',
}

describe('KeeperHubClient', () => {
  it('executeAndWait posts input and polls executions', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/execute') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        expect(body.input.signing).toBe('turnkey_via_keeperhub')
        return new Response(JSON.stringify({ executionId: 'kh-1', status: 'running' }), {
          status: 200,
        })
      }
      if (u.includes('/executions')) {
        return new Response(
          JSON.stringify([
            {
              id: 'kh-1',
              workflowId: 'wf-1',
              status: 'success',
              input: sampleInput,
              output: { success: true, data: { txHash: '0xabc' } },
              error: null,
            },
          ]),
          { status: 200 },
        )
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const client = new KeeperHubClient({
      apiKey: 'kh_test',
      workflowId: 'wf-1',
      baseUrl: 'https://app.keeperhub.com/api',
      fetchImpl,
      pollIntervalMs: 10,
      pollTimeoutMs: 2000,
    })

    const result = await client.executeAndWait(sampleInput)
    expect(result.status).toBe('success')
    expect(result.txHash).toBe('0xabc')
    expect(result.simulationStatus).toBe('OK')
  })

  it('assertNoPrivateKeys throws on leak', () => {
    expect(() =>
      KeeperHubClient.assertNoPrivateKeys({ privateKey: '0xdead' }),
    ).toThrow(KeeperHubError)
  })

  it('configured is false without credentials', () => {
    const client = new KeeperHubClient({ apiKey: '', workflowId: '' })
    expect(client.configured).toBe(false)
  })
})
