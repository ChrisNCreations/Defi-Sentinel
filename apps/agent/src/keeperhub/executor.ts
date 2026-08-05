import { KeeperHubClient, type KeeperHubClientOptions } from './client'
import { McpKeeperHubClient, type McpKeeperHubClientOptions } from './mcp-client'
import type { KeeperHubExecutor, KeeperHubTransport } from './types'

export type { KeeperHubExecutor, KeeperHubTransport }

export function parseTransport(
  value: string | undefined,
  fallback: KeeperHubTransport = 'rest',
): KeeperHubTransport {
  const v = (value ?? fallback).toLowerCase().trim()
  if (v === 'mcp') return 'mcp'
  return 'rest'
}

export interface CreateExecutorOptions {
  transport?: KeeperHubTransport
  rest?: KeeperHubClientOptions
  mcp?: McpKeeperHubClientOptions
  /** If MCP fails to construct/configure, fall back to REST */
  fallbackRest?: boolean
}

/**
 * Factory: default REST so product behavior is unchanged.
 * Set KEEPERHUB_TRANSPORT=mcp or pass transport: 'mcp'.
 */
export function createKeeperHubExecutor(opts: CreateExecutorOptions = {}): KeeperHubExecutor {
  const transport = opts.transport ?? parseTransport(process.env.KEEPERHUB_TRANSPORT)
  const fallbackRest =
    opts.fallbackRest ??
    (process.env.KEEPERHUB_MCP_FALLBACK_REST === '1' ||
      process.env.KEEPERHUB_MCP_FALLBACK_REST === 'true')

  if (transport === 'mcp') {
    try {
      const mcp = new McpKeeperHubClient(opts.mcp)
      if (mcp.configured) return mcp
      if (fallbackRest) {
        console.warn('[keeperhub] MCP not configured — falling back to REST')
        return new KeeperHubClient(opts.rest)
      }
      return mcp
    } catch (err) {
      if (fallbackRest) {
        console.warn(
          '[keeperhub] MCP init failed — falling back to REST:',
          err instanceof Error ? err.message : err,
        )
        return new KeeperHubClient(opts.rest)
      }
      throw err
    }
  }

  return new KeeperHubClient(opts.rest)
}

/** REST list for doctor / list-workflows (org only, no marketplace) */
export async function listOrgWorkflows(
  opts: KeeperHubClientOptions = {},
): Promise<import('./types').WorkflowSummary[]> {
  const client = new KeeperHubClient(opts)
  return client.listWorkflows()
}
