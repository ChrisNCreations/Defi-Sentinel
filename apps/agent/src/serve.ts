import {
  NETWORK_LABEL,
  POLL_INTERVAL_HOURS,
  PRODUCT_NAME,
  type NetworkId,
} from '@defi-sentinel/shared'
import { isAddress } from 'viem'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { getPositionState } from './aave/reader'
import { getNetworkConfig, getPollerConfig, hardGasCapGwei, parseNetworkId } from './config'
import { runCycle, type ForceMode } from './cycle/run-cycle'
import { resolvePollIntervalMs } from './poller/scheduler'
import { parseTransport, type KeeperHubTransport } from './keeperhub/executor'

export interface ServeOptions {
  port: number
  host: string
  /** Optional shared secret; when set, require Authorization: Bearer <token> */
  secret?: string
}

type ActionKind = 'chat' | 'force-soft' | 'force-safe' | 'guard' | 'cycle'

interface ActionBody {
  kind?: ActionKind
  actorWallet?: string
  targetWallet?: string
  organizationId?: string
  message?: string
  network?: string
  mockHf?: number
  gasGwei?: number
  execute?: boolean
  dryRunKeeper?: boolean
  dryRunAudit?: boolean
  writeAudit?: boolean
  useBrain?: boolean
  transport?: string
  scheduled?: boolean
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw) as unknown)
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function authorize(req: IncomingMessage, secret?: string): boolean {
  if (!secret) return true
  const header = req.headers.authorization ?? ''
  if (header === `Bearer ${secret}`) return true
  const alt = req.headers['x-agent-secret']
  return alt === secret
}

function parseKind(body: ActionBody): ActionKind {
  const k = (body.kind ?? 'cycle').toLowerCase()
  if (
    k === 'chat' ||
    k === 'force-soft' ||
    k === 'force-safe' ||
    k === 'guard' ||
    k === 'cycle'
  ) {
    return k
  }
  return 'cycle'
}

/**
 * Lightweight HTTP surface for the web app (Phase 7).
 * Does not replace the poller — run `dev`/`poll` separately, or use serve alone for manual UI actions.
 */
export function startHttpServer(opts: ServeOptions): Promise<{ close: () => Promise<void> }> {
  const poller = getPollerConfig()

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Secret',
        })
        res.end()
        return
      }

      if (!authorize(req, opts.secret)) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' })
        return
      }

      if (req.method === 'GET' && url.pathname === '/v1/health') {
        sendJson(res, 200, {
          ok: true,
          product: PRODUCT_NAME,
          network: process.env.AGENT_NETWORK ?? 'base-sepolia',
          pollIntervalHours: POLL_INTERVAL_HOURS,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/v1/status') {
        const network = parseNetworkId(
          url.searchParams.get('network') ?? process.env.AGENT_NETWORK ?? 'base-sepolia',
        )
        const wallet =
          url.searchParams.get('wallet') ?? poller.targetWallet ?? process.env.TARGET_WALLET
        const mockHfRaw = url.searchParams.get('mockHf')
        const mockHf = mockHfRaw != null ? Number(mockHfRaw) : undefined

        if (!wallet || !isAddress(wallet)) {
          sendJson(res, 400, { error: 'TARGET_WALLET_REQUIRED' })
          return
        }

        let position
        if (mockHf !== undefined && Number.isFinite(mockHf)) {
          position = {
            protocol: 'AaveV3' as const,
            network: NETWORK_LABEL[network],
            target_wallet: wallet,
            health_factor: mockHf,
            collateral_usd: 10_000,
            debt_usd: 8_000,
          }
        } else {
          try {
            position = await getPositionState(network, wallet)
          } catch (err) {
            sendJson(res, 502, {
              error: 'AAVE_READ_FAILED',
              message: err instanceof Error ? err.message : String(err),
            })
            return
          }
        }

        const intervalMs = resolvePollIntervalMs({
          pollIntervalMsEnv: process.env.POLL_INTERVAL_MS,
          pollIntervalHoursEnv: process.env.POLL_INTERVAL_HOURS,
          defaultHours: POLL_INTERVAL_HOURS,
        })

        sendJson(res, 200, {
          position,
          network,
          networkLabel: NETWORK_LABEL[network],
          poolAddress: getNetworkConfig(network).poolAddress,
          hardGasCapGwei: hardGasCapGwei(),
          pollIntervalMs: intervalMs,
          targetWallet: wallet,
          organizationId: poller.organizationId ?? null,
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/actions') {
        let body: ActionBody
        try {
          body = (await readJson(req)) as ActionBody
        } catch {
          sendJson(res, 400, { error: 'INVALID_JSON' })
          return
        }

        const kind = parseKind(body)
        const network: NetworkId = parseNetworkId(
          body.network ?? process.env.AGENT_NETWORK ?? 'base-sepolia',
        )
        const targetWallet =
          body.targetWallet ?? poller.targetWallet ?? process.env.TARGET_WALLET
        const organizationId =
          body.organizationId ?? poller.organizationId ?? process.env.ORGANIZATION_ID
        const actorWallet = body.actorWallet

        if (!targetWallet || !isAddress(targetWallet)) {
          sendJson(res, 400, { error: 'TARGET_WALLET_REQUIRED' })
          return
        }

        const scheduled = body.scheduled === true || kind === 'cycle'
        if (!scheduled && (!actorWallet || !isAddress(actorWallet))) {
          sendJson(res, 400, { error: 'ACTOR_WALLET_REQUIRED' })
          return
        }
        if (scheduled && !organizationId) {
          sendJson(res, 400, { error: 'ORGANIZATION_ID_REQUIRED' })
          return
        }
        if (kind === 'chat' && !body.message?.trim()) {
          sendJson(res, 400, { error: 'MESSAGE_REQUIRED' })
          return
        }

        const forceMode: ForceMode =
          kind === 'force-soft' ? 'force-soft' : kind === 'force-safe' ? 'force-safe' : null

        const transport: KeeperHubTransport = parseTransport(
          body.transport ?? process.env.KEEPERHUB_TRANSPORT,
          'rest',
        )

        const dryRunKeeper =
          body.dryRunKeeper === true ||
          process.env.KEEPERHUB_DRY_RUN === '1' ||
          process.env.KEEPERHUB_DRY_RUN === 'true'

        // execute=false → guardrails only; dryRunKeeper still runs KH payload path without broadcast
        const execute = body.execute !== false

        const result = await runCycle({
          network,
          targetWallet,
          organizationId,
          actorWallet: actorWallet && isAddress(actorWallet) ? actorWallet : undefined,
          triggerType: scheduled ? 'SCHEDULED_CRON' : 'MANUAL_OPERATOR',
          scheduled,
          mockHf: body.mockHf,
          gasGwei: body.gasGwei ?? hardGasCapGwei(),
          useBrain: body.useBrain !== false,
          operatorMessage: body.message,
          forceMode,
          execute,
          dryRunKeeper,
          dryRunAudit: body.dryRunAudit === true || !process.env.SUPABASE_SERVICE_ROLE_KEY,
          writeAudit: body.writeAudit !== false,
          transport,
          preferBrainGas: true,
        })

        sendJson(res, result.ok ? 200 : 422, {
          ok: result.ok,
          error: result.error,
          softFailure: result.softFailure,
          position: result.position,
          formulaAction: result.formulaAction,
          finalAction: result.finalAction,
          brain: result.brain
            ? {
                intent: result.brain.intent,
                gas: result.brain.gas,
                llmReasoning: result.brain.llmReasoning,
                notes: result.brain.notes,
              }
            : undefined,
          guardrails: result.guardrails
            ? {
                allowed: result.guardrails.allowed,
                violations: result.guardrails.violations,
                rulesChecked: result.guardrails.rulesChecked,
                organizationId: result.guardrails.organizationId,
                auditExecutionId: result.guardrails.auditExecutionId,
                effectiveRepayPct: result.guardrails.effectiveRepayPct,
              }
            : undefined,
          execution: result.exec
            ? {
                allowed: result.exec.allowed,
                executionStatus: result.exec.executionStatus,
                auditExecutionId: result.exec.auditExecutionId,
                violations: result.exec.violations,
                keeperhub: result.exec.keeperhub,
              }
            : undefined,
        })
        return
      }

      sendJson(res, 404, { error: 'NOT_FOUND' })
    } catch (err) {
      console.error('[serve] unhandled', err)
      sendJson(res, 500, {
        error: 'INTERNAL',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, opts.host, () => {
      console.log(
        `[${PRODUCT_NAME}] HTTP API listening on http://${opts.host}:${opts.port}`,
      )
      console.log('  GET  /v1/health')
      console.log('  GET  /v1/status?wallet=0x…')
      console.log('  POST /v1/actions')
      resolve({
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((e) => (e ? rejClose(e) : resClose()))
          }),
      })
    })
  })
}
