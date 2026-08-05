import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { KeeperHubClient, KeeperHubError } from './client'
import type {
  KeeperHubExecutionRecord,
  KeeperHubExecutor,
  KeeperHubRunResult,
  KeeperHubWorkflowInput,
} from './types'

/**
 * Only these MCP tools are allowed on the product path.
 * No marketplace, no create/update/delete workflow (see docs/keeperhub-integration.md).
 */
export const MCP_TOOL_ALLOWLIST = new Set(['execute_workflow', 'get_execution', 'list_workflows'])

const DEFAULT_MCP_URL = 'https://app.keeperhub.com/mcp'

export interface McpKeeperHubClientOptions {
  apiKey?: string
  workflowId?: string
  mcpUrl?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /** Inject for unit tests */
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

/**
 * Thin MCP client for org workflow execute + status.
 * Does not use marketplace, x402, or open-ended tool calling.
 */
export class McpKeeperHubClient implements KeeperHubExecutor {
  readonly transport = 'mcp' as const
  readonly apiKey: string
  readonly workflowId: string
  readonly mcpUrl: string
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number
  private readonly callToolImpl?: McpKeeperHubClientOptions['callTool']

  constructor(opts: McpKeeperHubClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.KEEPERHUB_API_KEY ?? ''
    this.workflowId = opts.workflowId ?? process.env.KEEPERHUB_WORKFLOW_ID ?? ''
    this.mcpUrl = (
      opts.mcpUrl ??
      process.env.KEEPERHUB_MCP_URL ??
      DEFAULT_MCP_URL
    ).replace(/\/$/, '')
    this.pollIntervalMs = opts.pollIntervalMs ?? 750
    this.pollTimeoutMs = opts.pollTimeoutMs ?? 60_000
    this.callToolImpl = opts.callTool
  }

  get configured(): boolean {
    return Boolean(this.apiKey && this.workflowId)
  }

  async executeAndWait(
    input: KeeperHubWorkflowInput,
    options: { maxRetries?: number } = {},
  ): Promise<KeeperHubRunResult> {
    if (!this.configured) {
      throw new KeeperHubError('KEEPERHUB_API_KEY / KEEPERHUB_WORKFLOW_ID missing', 'NOT_CONFIGURED')
    }

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
      transport: 'mcp',
    }
  }

  async executeWorkflow(input: KeeperHubWorkflowInput): Promise<{ executionId: string; status: string }> {
    // Prefer common MCP arg shapes; try primary then alternate if needed
    const primary = await this.safeCallTool('execute_workflow', {
      workflowId: this.workflowId,
      input,
    })

    let parsed = parseExecuteResult(primary)
    if (!parsed.executionId) {
      const alt = await this.safeCallTool('execute_workflow', {
        id: this.workflowId,
        workflow_id: this.workflowId,
        inputs: input,
        input,
      })
      parsed = parseExecuteResult(alt)
    }

    if (!parsed.executionId) {
      throw new KeeperHubError(
        `MCP execute_workflow missing executionId: ${JSON.stringify(primary).slice(0, 400)}`,
        'BAD_RESPONSE',
      )
    }

    return {
      executionId: parsed.executionId,
      status: parsed.status ?? 'running',
    }
  }

  async getExecution(executionId: string): Promise<KeeperHubExecutionRecord | null> {
    const raw = await this.safeCallTool('get_execution', {
      executionId,
      id: executionId,
      execution_id: executionId,
    })
    KeeperHubClient.assertNoPrivateKeys(raw)
    return normalizeExecutionRecord(raw, this.workflowId, executionId)
  }

  async listToolNames(): Promise<string[]> {
    if (this.callToolImpl) {
      return [...MCP_TOOL_ALLOWLIST]
    }
    const session = await this.connect()
    try {
      const listed = await session.client.listTools()
      return (listed.tools ?? []).map((t) => t.name)
    } finally {
      await session.close()
    }
  }

  async ping(): Promise<{ ok: boolean; tools?: string[]; error?: string }> {
    try {
      const tools = await this.listToolNames()
      return { ok: true, tools }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private async waitForExecution(executionId: string): Promise<KeeperHubExecutionRecord> {
    const deadline = Date.now() + this.pollTimeoutMs
    while (Date.now() < deadline) {
      const record = await this.getExecution(executionId)
      if (record && isTerminal(record.status)) {
        KeeperHubClient.assertNoPrivateKeys(record)
        return record
      }
      await sleep(this.pollIntervalMs)
    }
    throw new KeeperHubError(`MCP timed out waiting for execution ${executionId}`, 'POLL_TIMEOUT')
  }

  private async safeCallTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!MCP_TOOL_ALLOWLIST.has(name)) {
      throw new KeeperHubError(`MCP tool not allowlisted: ${name}`, 'TOOL_FORBIDDEN')
    }
    // Marketplace tools blocked by name pattern
    if (name.includes('call_workflow') || name.includes('search_workflows')) {
      throw new KeeperHubError(`Marketplace MCP tool blocked: ${name}`, 'MARKETPLACE_BLOCKED')
    }

    if (this.callToolImpl) {
      const result = await this.callToolImpl(name, args)
      KeeperHubClient.assertNoPrivateKeys(result)
      return result
    }

    const session = await this.connect()
    try {
      const result = await session.client.callTool({ name, arguments: args })
      if (result.isError) {
        const text = extractTextContent(result.content)
        throw new KeeperHubError(`MCP tool error: ${text}`, 'MCP_TOOL_ERROR')
      }
      const payload = extractToolPayload(result.content)
      KeeperHubClient.assertNoPrivateKeys(payload)
      return payload
    } finally {
      await session.close()
    }
  }

  private async connect(): Promise<{ client: Client; close: () => Promise<void> }> {
    if (!this.apiKey) {
      throw new KeeperHubError('KEEPERHUB_API_KEY missing for MCP', 'NOT_CONFIGURED')
    }

    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    })

    const client = new Client({ name: 'defi-sentinel-agent', version: '0.1.0' })
    await client.connect(transport)

    return {
      client,
      close: async () => {
        try {
          await client.close()
        } catch {
          /* ignore */
        }
      },
    }
  }

  private toRunResult(record: KeeperHubExecutionRecord, retryAttempts: number): KeeperHubRunResult {
    const status = record.status
    const failed = isFailed(status)
    const txHash =
      record.txHash ??
      record.transactionHash ??
      extractNestedString(record.output, 'txHash') ??
      extractNestedString(record.output, 'transactionHash') ??
      extractNestedString(record.output, 'hash')

    return {
      workflowId: record.workflowId || this.workflowId,
      executionId: record.id,
      status,
      simulationStatus: failed ? 'FAILED' : status === 'success' || status === 'completed' ? 'OK' : 'UNKNOWN',
      txHash,
      gasUsed: record.gasUsed != null ? String(record.gasUsed) : extractNestedString(record.output, 'gasUsed'),
      effectiveGasPriceGwei:
        record.effectiveGasPriceGwei != null
          ? String(record.effectiveGasPriceGwei)
          : extractNestedString(record.output, 'effectiveGasPriceGwei'),
      retryAttempts,
      raw: record,
      error: record.error ?? undefined,
      transport: 'mcp',
    }
  }
}

function parseExecuteResult(raw: unknown): { executionId?: string; status?: string } {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const nested =
    o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : undefined
  const executionId = String(
    o.executionId ?? o.execution_id ?? o.id ?? nested?.executionId ?? nested?.id ?? '',
  )
  const status = o.status != null ? String(o.status) : nested?.status != null ? String(nested.status) : undefined
  return {
    executionId: executionId || undefined,
    status,
  }
}

function normalizeExecutionRecord(
  raw: unknown,
  workflowId: string,
  fallbackId: string,
): KeeperHubExecutionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const nested =
    o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : undefined
  const id = String(o.id ?? o.executionId ?? o.execution_id ?? nested?.id ?? fallbackId)
  const status = String(o.status ?? nested?.status ?? 'running')
  return {
    id,
    workflowId: String(o.workflowId ?? o.workflow_id ?? nested?.workflowId ?? workflowId),
    status,
    input: o.input ?? nested?.input,
    output: o.output ?? nested?.output ?? o.result ?? nested?.result,
    error:
      (o.error as string | null | undefined) ??
      (nested?.error as string | null | undefined) ??
      null,
    txHash: (o.txHash ?? o.transactionHash ?? nested?.txHash) as string | undefined,
    transactionHash: (o.transactionHash ?? nested?.transactionHash) as string | undefined,
    gasUsed: (o.gasUsed ?? nested?.gasUsed) as string | number | undefined,
    startedAt: (o.startedAt ?? nested?.startedAt) as string | undefined,
    completedAt: (o.completedAt ?? nested?.completedAt) as string | undefined,
  }
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return String(content ?? '')
  return content
    .map((c) => {
      if (c && typeof c === 'object' && 'text' in c) return String((c as { text: string }).text)
      return ''
    })
    .join('\n')
}

function extractToolPayload(content: unknown): unknown {
  const text = extractTextContent(content)
  if (!text) return content
  try {
    return JSON.parse(text) as unknown
  } catch {
    // Some servers return plain text id
    if (text.includes('executionId') || text.startsWith('{')) {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1)) as unknown
        } catch {
          /* fall through */
        }
      }
    }
    return { raw: text }
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
