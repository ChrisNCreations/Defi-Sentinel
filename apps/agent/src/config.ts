import {
  DEFAULT_AAVE_POOL,
  type NetworkId,
} from '@defi-sentinel/shared'
import type { Address } from 'viem'

export type { NetworkId }

export interface NetworkConfig {
  id: NetworkId
  rpcUrl: string
  poolAddress: Address
}

export type AgentMode = 'idle' | 'once' | 'decide' | 'force-soft' | 'force-safe' | 'guard'

const DEFAULT_RPC: Record<NetworkId, string> = {
  'base-sepolia': 'https://sepolia.base.org',
  'eth-sepolia': 'https://rpc.sepolia.org',
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') return undefined
  return value.trim()
}

export function getNetworkConfig(networkId: NetworkId): NetworkConfig {
  if (networkId === 'base-sepolia') {
    return {
      id: 'base-sepolia',
      rpcUrl: readEnv('RPC_URL_BASE_SEPOLIA') ?? DEFAULT_RPC['base-sepolia'],
      poolAddress: (readEnv('AAVE_POOL_ADDRESS_BASE_SEPOLIA') ??
        DEFAULT_AAVE_POOL['base-sepolia']) as Address,
    }
  }

  return {
    id: 'eth-sepolia',
    rpcUrl: readEnv('RPC_URL_ETH_SEPOLIA') ?? DEFAULT_RPC['eth-sepolia'],
    poolAddress: (readEnv('AAVE_POOL_ADDRESS_ETH_SEPOLIA') ??
      DEFAULT_AAVE_POOL['eth-sepolia']) as Address,
  }
}

export function parseNetworkId(value: string | undefined): NetworkId {
  const raw = (value ?? 'base-sepolia').toLowerCase().trim()
  if (raw === 'base-sepolia' || raw === 'base' || raw === 'basesepolia') {
    return 'base-sepolia'
  }
  if (raw === 'eth-sepolia' || raw === 'sepolia' || raw === 'ethereum-sepolia' || raw === 'eth') {
    return 'eth-sepolia'
  }
  throw new Error(`Unknown network "${value}". Use base-sepolia or eth-sepolia.`)
}

function flagValue(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0) return argv[idx + 1]
  return undefined
}

/** Parse CLI flags for decide / force / guard modes */
export function parseCliArgs(argv: string[]): {
  mode: AgentMode
  once: boolean
  decide: boolean
  wallet?: string
  actor?: string
  network: NetworkId
  mockHf?: number
  gasGwei: number
  orgId?: string
  dryRunAudit: boolean
  writeAudit: boolean
  /** Skip KeeperHub execute (payload + guardrails only) */
  dryRunKeeper: boolean
  /** After guardrails, call KeeperHub (default true for force-* modes) */
  execute: boolean
} {
  const once = argv.includes('--once')
  const decide = argv.includes('--decide') || argv.includes('decide')
  const forceSoft = argv.includes('--force-soft') || argv.includes('force-soft')
  const forceSafe = argv.includes('--force-safe') || argv.includes('force-safe')
  const guard = argv.includes('--guard') || argv.includes('guard')

  let mode: AgentMode = 'idle'
  if (forceSoft) mode = 'force-soft'
  else if (forceSafe) mode = 'force-safe'
  else if (guard) mode = 'guard'
  else if (decide || flagValue(argv, '--wallet') || flagValue(argv, '--mock-hf')) mode = 'decide'
  else if (once) mode = 'once'

  const wallet =
    flagValue(argv, '--wallet') ??
    flagValue(argv, '-w') ??
    // positional after decide/force/guard
    (() => {
      const keys = ['decide', '--decide', 'force-soft', '--force-soft', 'force-safe', '--force-safe', 'guard', '--guard']
      for (const k of keys) {
        const i = argv.indexOf(k)
        if (i >= 0) {
          const next = argv[i + 1]
          if (next && !next.startsWith('-') && next.startsWith('0x')) return next
        }
      }
      return undefined
    })()

  const actor = flagValue(argv, '--actor') ?? flagValue(argv, '--operator')
  const networkRaw = flagValue(argv, '--network') ?? flagValue(argv, '-n')
  const mockHfRaw = flagValue(argv, '--mock-hf')
  const gasRaw = flagValue(argv, '--gas-gwei')
  const orgId = flagValue(argv, '--org')
  const mockHf = mockHfRaw !== undefined ? Number(mockHfRaw) : undefined
  const gasGwei = gasRaw !== undefined && Number.isFinite(Number(gasRaw))
    ? Number(gasRaw)
    : Number(readEnv('HARD_GAS_CAP_GWEI') ?? 20)

  const dryRunKeeper =
    argv.includes('--dry-run-keeper') ||
    readEnv('KEEPERHUB_DRY_RUN') === '1' ||
    readEnv('KEEPERHUB_DRY_RUN') === 'true'

  // force-* executes by default; --no-execute keeps Phase 3-only behavior
  const execute =
    !argv.includes('--no-execute') &&
    (mode === 'force-soft' || mode === 'force-safe' || argv.includes('--execute'))

  return {
    mode,
    once,
    decide: mode === 'decide',
    wallet,
    actor,
    network: parseNetworkId(networkRaw ?? readEnv('AGENT_NETWORK') ?? 'base-sepolia'),
    mockHf: mockHf !== undefined && Number.isFinite(mockHf) ? mockHf : undefined,
    gasGwei,
    orgId,
    dryRunAudit: argv.includes('--dry-run-audit') || !readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    writeAudit: !argv.includes('--no-audit'),
    dryRunKeeper,
    execute,
  }
}

export function hardGasCapGwei(): number {
  const raw = readEnv('HARD_GAS_CAP_GWEI')
  const n = raw ? Number(raw) : 50
  return Number.isFinite(n) ? n : 50
}
