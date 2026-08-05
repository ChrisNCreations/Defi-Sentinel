import {
  DEFAULT_AAVE_POOL,
  type NetworkId,
} from '@defi-sentinel/shared'
import type { Address } from 'viem'
import { parseTransport, type KeeperHubTransport } from './keeperhub/executor'

export type { NetworkId }
export type { KeeperHubTransport }

export interface NetworkConfig {
  id: NetworkId
  rpcUrl: string
  poolAddress: Address
}

export type AgentMode =
  | 'idle'
  | 'once'
  | 'decide'
  | 'force-soft'
  | 'force-safe'
  | 'guard'
  | 'chat'
  | 'doctor'
  | 'list-workflows'
  | 'kh'

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

/** Parse CLI flags for decide / force / guard / chat modes */
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
  message?: string
  dryRunAudit: boolean
  writeAudit: boolean
  dryRunKeeper: boolean
  execute: boolean
  useBrain: boolean
  transport: KeeperHubTransport
  /** Extra args after `kh` subcommand */
  khArgs: string[]
} {
  const once = argv.includes('--once')
  const decide = argv.includes('--decide') || argv.includes('decide')
  const forceSoft = argv.includes('--force-soft') || argv.includes('force-soft')
  const forceSafe = argv.includes('--force-safe') || argv.includes('force-safe')
  const guard = argv.includes('--guard') || argv.includes('guard')
  const chat = argv.includes('--chat') || argv.includes('chat') || argv.includes('ask')
  const doctor = argv.includes('--doctor') || argv.includes('doctor')
  const listWorkflows =
    argv.includes('--list-workflows') ||
    argv.includes('list-workflows') ||
    argv.includes('workflows')
  const khIdx = argv.findIndex((a) => a === 'kh' || a === '--kh')

  let mode: AgentMode = 'idle'
  if (doctor) mode = 'doctor'
  else if (listWorkflows) mode = 'list-workflows'
  else if (khIdx >= 0) mode = 'kh'
  else if (chat) mode = 'chat'
  else if (forceSoft) mode = 'force-soft'
  else if (forceSafe) mode = 'force-safe'
  else if (guard) mode = 'guard'
  else if (decide || flagValue(argv, '--wallet') || flagValue(argv, '--mock-hf')) mode = 'decide'
  else if (once) mode = 'once'

  const transport = parseTransport(
    flagValue(argv, '--transport') ?? process.env.KEEPERHUB_TRANSPORT,
    'rest',
  )
  const khArgs = khIdx >= 0 ? argv.slice(khIdx + 1) : []

  const wallet =
    flagValue(argv, '--wallet') ??
    flagValue(argv, '-w') ??
    (() => {
      const keys = [
        'decide',
        '--decide',
        'force-soft',
        '--force-soft',
        'force-safe',
        '--force-safe',
        'guard',
        '--guard',
        'chat',
        '--chat',
        'ask',
      ]
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
  const message =
    flagValue(argv, '--message') ??
    flagValue(argv, '-m') ??
    flagValue(argv, '--prompt')
  const mockHf = mockHfRaw !== undefined ? Number(mockHfRaw) : undefined
  const gasGwei =
    gasRaw !== undefined && Number.isFinite(Number(gasRaw))
      ? Number(gasRaw)
      : Number(readEnv('HARD_GAS_CAP_GWEI') ?? 20)

  const dryRunKeeper =
    argv.includes('--dry-run-keeper') ||
    readEnv('KEEPERHUB_DRY_RUN') === '1' ||
    readEnv('KEEPERHUB_DRY_RUN') === 'true'

  const execute =
    !argv.includes('--no-execute') &&
    (mode === 'force-soft' ||
      mode === 'force-safe' ||
      mode === 'chat' ||
      argv.includes('--execute'))

  // Brain runs for chat always; for force-* unless --no-brain
  const useBrain =
    !argv.includes('--no-brain') &&
    (mode === 'chat' || mode === 'force-soft' || mode === 'force-safe' || mode === 'guard')

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
    message,
    dryRunAudit: argv.includes('--dry-run-audit') || !readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    writeAudit: !argv.includes('--no-audit'),
    dryRunKeeper,
    execute,
    useBrain,
    transport,
    khArgs,
  }
}

export function hardGasCapGwei(): number {
  const raw = readEnv('HARD_GAS_CAP_GWEI')
  const n = raw ? Number(raw) : 50
  return Number.isFinite(n) ? n : 50
}
