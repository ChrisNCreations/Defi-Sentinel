import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { getNetworkConfig } from '../config'
import { hasSupabaseConfig } from '../supabase/client'
import { KeeperHubClient } from './client'
import { createKeeperHubExecutor, parseTransport } from './executor'
import { McpKeeperHubClient } from './mcp-client'

/**
 * Ops health check — does not execute workflows or touch marketplace.
 */
export async function runDoctor(transportHint?: string): Promise<number> {
  const transport = parseTransport(transportHint ?? process.env.KEEPERHUB_TRANSPORT, 'rest')
  console.log('[doctor] DeFi Sentinel / KeeperHub connectivity\n')

  const checks: { name: string; ok: boolean; detail: string }[] = []

  // Env
  const hasKey = Boolean(process.env.KEEPERHUB_API_KEY)
  const hasWf = Boolean(process.env.KEEPERHUB_WORKFLOW_ID)
  checks.push({
    name: 'KEEPERHUB_API_KEY',
    ok: hasKey,
    detail: hasKey ? `set (len=${process.env.KEEPERHUB_API_KEY!.length})` : 'missing',
  })
  checks.push({
    name: 'KEEPERHUB_WORKFLOW_ID',
    ok: hasWf,
    detail: hasWf ? process.env.KEEPERHUB_WORKFLOW_ID! : 'missing',
  })
  checks.push({
    name: 'transport',
    ok: true,
    detail: transport,
  })
  checks.push({
    name: 'supabase',
    ok: hasSupabaseConfig(),
    detail: hasSupabaseConfig() ? 'SUPABASE_URL + service role set' : 'not configured',
  })
  checks.push({
    name: 'gemini',
    ok: Boolean(process.env.GEMINI_API_KEY),
    detail: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY set' : 'missing (heuristics fallback)',
  })

  // REST ping
  const rest = new KeeperHubClient()
  const restPing = await rest.ping()
  checks.push({
    name: 'keeperhub REST',
    ok: restPing.ok,
    detail: restPing.ok
      ? `OK status=${restPing.status} workflows≈${restPing.count ?? '?'}`
      : `FAIL ${restPing.error ?? restPing.status}`,
  })

  // MCP ping (optional)
  if (transport === 'mcp' || process.env.KEEPERHUB_MCP_URL) {
    const mcp = new McpKeeperHubClient()
    const mcpPing = await mcp.ping()
    checks.push({
      name: 'keeperhub MCP',
      ok: mcpPing.ok,
      detail: mcpPing.ok
        ? `OK tools=${(mcpPing.tools ?? []).slice(0, 8).join(', ')}${(mcpPing.tools?.length ?? 0) > 8 ? '…' : ''}`
        : `FAIL ${mcpPing.error}`,
    })
  } else {
    checks.push({
      name: 'keeperhub MCP',
      ok: true,
      detail: 'skipped (transport=rest; set KEEPERHUB_TRANSPORT=mcp to probe)',
    })
  }

  // Executor factory
  try {
    const ex = createKeeperHubExecutor({ transport })
    checks.push({
      name: 'executor factory',
      ok: ex.configured,
      detail: `transport=${ex.transport} workflow=${ex.workflowId || '—'} configured=${ex.configured}`,
    })
  } catch (err) {
    checks.push({
      name: 'executor factory',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // RPC
  try {
    const cfg = getNetworkConfig('base-sepolia')
    const client = createPublicClient({ chain: baseSepolia, transport: http(cfg.rpcUrl) })
    const block = await client.getBlockNumber()
    checks.push({
      name: 'RPC base-sepolia',
      ok: true,
      detail: `block ${block}`,
    })
  } catch (err) {
    checks.push({
      name: 'RPC base-sepolia',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // Optional kh binary
  const kh = await whichKh()
  checks.push({
    name: 'kh CLI binary',
    ok: true,
    detail: kh ?? 'not installed (optional — brew install keeperhub/tap/kh)',
  })

  let failed = 0
  for (const c of checks) {
    const mark = c.ok ? 'OK ' : 'FAIL'
    if (!c.ok) failed++
    console.log(`  ${mark}  ${c.name.padEnd(22)} ${c.detail}`)
  }

  console.log(
    failed === 0
      ? '\n[doctor] all required checks passed'
      : `\n[doctor] ${failed} check(s) failed`,
  )
  return failed === 0 ? 0 : 1
}

export async function runListWorkflows(): Promise<number> {
  try {
    const rest = new KeeperHubClient()
    const list = await rest.listWorkflows()
    console.log(`[list-workflows] ${list.length} org workflow(s)\n`)
    for (const w of list) {
      console.log(`  ${w.id}  ${w.name}${w.enabled === false ? ' (disabled)' : ''}`)
      if (w.description) console.log(`             ${w.description.slice(0, 100)}`)
    }
    return 0
  } catch (err) {
    console.error('[list-workflows]', err instanceof Error ? err.message : err)
    return 1
  }
}

async function whichKh(): Promise<string | null> {
  const { spawnSync } = await import('node:child_process')
  const isWin = process.platform === 'win32'
  const cmd = isWin ? 'where' : 'which'
  const r = spawnSync(cmd, ['kh'], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.trim())
  return line?.trim() || null
}
