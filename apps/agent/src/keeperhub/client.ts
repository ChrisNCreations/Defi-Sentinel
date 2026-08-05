import type {
  KeeperHubExecuteStart,
  KeeperHubExecutionRecord,
  KeeperHubExecutor,
  KeeperHubRunResult,
  KeeperHubWorkflowInput,
  WorkflowSummary,
} from './types'

export interface KeeperHubClientOptions {
  apiKey?: string
  workflowId?: string
  baseUrl?: string
  /** Override fetch for tests */
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

const DEFAULT_BASE = 'https://app.keeperhub.com/api'

export class KeeperHubError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'KeeperHubError'
  }
}

/**
 * REST client for KeeperHub workflows (default transport).
 * Signing is always remote (Turnkey via KeeperHub) — this client never holds keys.
 */
export class KeeperHubClient implements KeeperHubExecutor {
  readonly transport = 'rest' as const
  readonly apiKey: string
  readonly workflowId: string
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number

  constructor(opts: KeeperHubClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.KEEPERHUB_API_KEY ?? ''
    this.workflowId = opts.workflowId ?? process.env.KEEPERHUB_WORKFLOW_ID ?? ''
    this.baseUrl = (opts.baseUrl ?? process.env.KEEPERHUB_API_BASE ?? DEFAULT_BASE).replace(
      /\/$/,
      '',
    )
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.pollIntervalMs = opts.pollIntervalMs ?? 750
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 60_000
  }

  get configured(): boolean {
    return Boolean(this.apiKey && this.workflowId)
  }

  /** Org workflows only (GET /api/workflows) — not marketplace */
  async listWorkflows(): Promise<WorkflowSummary[]> {
    if (!this.apiKey) {
      throw new KeeperHubError('KEEPERHUB_API_KEY missing', 'NOT_CONFIGURED')
    }
    const res = await this.fetchImpl(`${this.baseUrl}/workflows`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    })
    const body = await res.json().catch(() => [])
    KeeperHubClient.assertNoPrivateKeys(body)
    if (!res.ok) {
      throw new KeeperHubError(`List workflows failed: ${res.status}`, 'LIST_FAILED', res.status, body)
    }
    const rows = Array.isArray(body) ? body : []
    return rows.map((w: { id?: string; name?: string; description?: string; enabled?: boolean }) => ({
      id: String(w.id ?? ''),
      name: String(w.name ?? ''),
      description: w.description,
      enabled: w.enabled,
    }))
  }

  async ping(): Promise<{ ok: boolean; status: number; count?: number; error?: string }> {
    if (!this.apiKey) return { ok: false, status: 0, error: 'no api key' }
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/workflows`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      })
      if (!res.ok) return { ok: false, status: res.status, error: await res.text() }
      const body = (await res.json()) as unknown[]
      return { ok: true, status: res.status, count: Array.isArray(body) ? body.length : undefined }
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Assert agent never receives private key material from KeeperHub responses.
   */
  static assertNoPrivateKeys(payload: unknown): void {
    const text = JSON.stringify(payload ?? {})
    const forbidden = [
      /"privateKey"\s*:/i,
      /"private_key"\s*:/i,
      /"mnemonic"\s*:/i,
      /"seedPhrase"\s*:/i,
      /"secretKey"\s*:/i,
    ]
    for (const re of forbidden) {
      if (re.test(text)) {
        throw new KeeperHubError(
          'KeeperHub response contained private key material — aborting',
          'PRIVATE_KEY_LEAK',
        )
      }
    }
  }

  async executeWorkflow(input: KeeperHubWorkflowInput): Promise<KeeperHubExecuteStart> {
    if (!this.configured) {
      throw new KeeperHubError('KEEPERHUB_API_KEY / KEEPERHUB_WORKFLOW_ID missing', 'NOT_CONFIGURED')
    }

    const res = await this.fetchImpl(`${this.baseUrl}/workflows/${this.workflowId}/execute`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ input }),
    })

    const body = await res.json().catch(() => ({}))
    KeeperHubClient.assertNoPrivateKeys(body)

    if (!res.ok) {
      throw new KeeperHubError(
        `Execute failed: ${res.status} ${JSON.stringify(body)}`,
        'EXECUTE_FAILED',
        res.status,
        body,
      )
    }

    const executionId = (body as { executionId?: string }).executionId
    if (!executionId) {
      throw new KeeperHubError('Execute response missing executionId', 'BAD_RESPONSE', res.status, body)
    }

    return {
      executionId,
      status: (body as { status?: string }).status ?? 'running',
    }
  }

  async listExecutions(limit = 50): Promise<KeeperHubExecutionRecord[]> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/workflows/${this.workflowId}/executions?limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      },
    )
    const body = await res.json().catch(() => [])
    KeeperHubClient.assertNoPrivateKeys(body)
    if (!res.ok) {
      throw new KeeperHubError(
        `List executions failed: ${res.status}`,
        'LIST_FAILED',
        res.status,
        body,
      )
    }
    return body as KeeperHubExecutionRecord[]
  }

  async getExecution(executionId: string): Promise<KeeperHubExecutionRecord | null> {
    const list = await this.listExecutions(100)
    return list.find((e) => e.id === executionId) ?? null
  }

  /**
   * Execute and poll until terminal status or timeout.
   */
  async executeAndWait(
    input: KeeperHubWorkflowInput,
    options: { maxRetries?: number } = {},
  ): Promise<KeeperHubRunResult> {
    const maxRetries = options.maxRetries ?? 0
    let lastError: string | undefined
    let attempts = 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts = attempt
      try {
        const start = await this.executeWorkflow(input)
        const record = await this.waitForExecution(start.executionId)
        return this.toRunResult(record, attempts)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt >= maxRetries) break
      }
    }

    return {
      workflowId: this.workflowId,
      executionId: input.executionId,
      status: 'failed',
      simulationStatus: 'FAILED',
      retryAttempts: attempts,
      error: lastError ?? 'UNKNOWN',
      transport: 'rest',
    }
  }

  async waitForExecution(executionId: string): Promise<KeeperHubExecutionRecord> {
    const deadline = Date.now() + this.pollTimeoutMs
    while (Date.now() < deadline) {
      const record = await this.getExecution(executionId)
      if (record && isTerminal(record.status)) {
        KeeperHubClient.assertNoPrivateKeys(record)
        return record
      }
      await sleep(this.pollIntervalMs)
    }
    throw new KeeperHubError(
      `Timed out waiting for execution ${executionId}`,
      'POLL_TIMEOUT',
    )
  }

  private toRunResult(record: KeeperHubExecutionRecord, retryAttempts: number): KeeperHubRunResult {
    const txHash = extractTxHash(record)
    const status = record.status
    const failed = isFailed(status)

    return {
      workflowId: record.workflowId || this.workflowId,
      executionId: record.id,
      status,
      simulationStatus: failed ? 'FAILED' : status === 'success' ? 'OK' : 'UNKNOWN',
      txHash,
      gasUsed: record.gasUsed != null ? String(record.gasUsed) : extractNestedString(record.output, 'gasUsed'),
      effectiveGasPriceGwei:
        record.effectiveGasPriceGwei != null
          ? String(record.effectiveGasPriceGwei)
          : extractNestedString(record.output, 'effectiveGasPriceGwei'),
      retryAttempts,
      raw: record,
      error: record.error ?? undefined,
      transport: 'rest',
    }
  }
}

function isTerminal(status: string): boolean {
  const s = status.toLowerCase()
  return ['success', 'failed', 'error', 'cancelled', 'completed', 'reverted'].includes(s)
}

function isFailed(status: string): boolean {
  const s = status.toLowerCase()
  return ['failed', 'error', 'cancelled', 'reverted'].includes(s)
}

function extractTxHash(record: KeeperHubExecutionRecord): string | undefined {
  if (record.txHash) return record.txHash
  if (record.transactionHash) return record.transactionHash
  return (
    extractNestedString(record.output, 'txHash') ??
    extractNestedString(record.output, 'transactionHash') ??
    extractNestedString(record.output, 'hash')
  )
}

function extractNestedString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const rec = obj as Record<string, unknown>
  if (typeof rec[key] === 'string') return rec[key] as string
  if (rec.data && typeof rec.data === 'object') {
    const d = rec.data as Record<string, unknown>
    if (typeof d[key] === 'string') return d[key] as string
  }
  return undefined
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function createKeeperHubClient(opts?: KeeperHubClientOptions): KeeperHubClient {
  return new KeeperHubClient(opts)
}
