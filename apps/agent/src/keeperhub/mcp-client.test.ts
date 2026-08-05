import { describe, expect, it } from 'vitest'
import { MCP_TOOL_ALLOWLIST, McpKeeperHubClient } from './mcp-client'

describe('McpKeeperHubClient', () => {
  it('allowlist blocks marketplace tools', () => {
    expect(MCP_TOOL_ALLOWLIST.has('execute_workflow')).toBe(true)
    expect(MCP_TOOL_ALLOWLIST.has('get_execution')).toBe(true)
    expect(MCP_TOOL_ALLOWLIST.has('call_workflow')).toBe(false)
  })

  it('executeAndWait via injected callTool', async () => {
    const client = new McpKeeperHubClient({
      apiKey: 'kh_test',
      workflowId: 'wf-1',
      pollIntervalMs: 5,
      pollTimeoutMs: 2000,
      callTool: async (name, args) => {
        if (name === 'execute_workflow') {
          expect(args.workflowId).toBe('wf-1')
          expect((args.input as { signing: string }).signing).toBe('turnkey_via_keeperhub')
          return { executionId: 'ex-1', status: 'running' }
        }
        if (name === 'get_execution') {
          return {
            id: 'ex-1',
            workflowId: 'wf-1',
            status: 'success',
            output: { success: true, data: { txHash: '0xabc' } },
            error: null,
          }
        }
        throw new Error(`unexpected tool ${name}`)
      },
    })

    const result = await client.executeAndWait({
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
      executionId: 'local-1',
      signing: 'turnkey_via_keeperhub',
    })

    expect(result.transport).toBe('mcp')
    expect(result.status).toBe('success')
    expect(result.txHash).toBe('0xabc')
    expect(result.simulationStatus).toBe('OK')
  })

  it('configured requires key + workflow id', () => {
    expect(new McpKeeperHubClient({ apiKey: '', workflowId: '' }).configured).toBe(false)
    expect(new McpKeeperHubClient({ apiKey: 'kh_x', workflowId: 'wf' }).configured).toBe(true)
  })
})
