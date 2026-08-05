import type { NetworkId } from '@defi-sentinel/shared'
import { runCycle, type RunCycleResult } from '../cycle/run-cycle'
import type { KeeperHubTransport } from '../config'

export interface PollerTickConfig {
  network: NetworkId
  targetWallet: string
  organizationId: string
  /** Optional mock HF (tests / demos without RPC) */
  mockHf?: number
  gasGwei: number
  useBrain: boolean
  execute: boolean
  dryRunKeeper: boolean
  dryRunAudit: boolean
  writeAudit: boolean
  transport: KeeperHubTransport
  log?: (line: string) => void
}

/**
 * One scheduled cycle: formula → brain → guardrails → KeeperHub (if needed).
 * Always audits NONE when writeAudit is enabled. Never throws for soft failures.
 */
export async function runPollerTick(config: PollerTickConfig): Promise<RunCycleResult> {
  const log = config.log ?? ((line: string) => console.log(line))

  log('[poller] scheduled cycle')
  log(`  target: ${config.targetWallet}`)
  log(`  org: ${config.organizationId}`)
  log(`  execute: ${config.execute} dryRunKeeper: ${config.dryRunKeeper}`)

  const result = await runCycle({
    network: config.network,
    targetWallet: config.targetWallet,
    organizationId: config.organizationId,
    triggerType: 'SCHEDULED_CRON',
    scheduled: true,
    mockHf: config.mockHf,
    gasGwei: config.gasGwei,
    useBrain: config.useBrain,
    operatorMessage: 'scheduled health check — rebalance if needed',
    execute: config.execute,
    dryRunKeeper: config.dryRunKeeper,
    dryRunAudit: config.dryRunAudit,
    writeAudit: config.writeAudit,
    transport: config.transport,
    preferBrainGas: true,
    log,
  })

  if (!result.ok) {
    log(`[poller] cycle ended with error: ${result.error ?? 'unknown'}`)
  } else {
    log(
      `[poller] cycle ok — action ${result.finalAction?.type ?? '—'} hf=${
        result.position ? result.position.health_factor : '—'
      }`,
    )
  }

  return result
}
