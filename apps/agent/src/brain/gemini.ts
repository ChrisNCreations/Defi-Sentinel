import { GoogleGenerativeAI } from '@google/generative-ai'
import { gasEstimatePrompt, intentPrompt, thoughtSummaryPrompt } from './prompts'
import {
  clampGasEstimate,
  parseIntentKind,
  parseJsonObject,
  proposedToolCall,
  resolveActionFromIntent,
} from './revalidate'
import type {
  BrainContext,
  BrainResult,
  GasEstimate,
  LlmReasoning,
  OperatorIntent,
} from './types'

/** Default model — override with GEMINI_MODEL (2.5-flash may be unavailable to new keys). */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

export interface GeminiClientOptions {
  apiKey?: string
  model?: string
  /** Inject for tests */
  generateText?: (prompt: string) => Promise<string>
}

export class GeminiClient {
  private readonly generateText: (prompt: string) => Promise<string>
  readonly configured: boolean
  readonly modelName: string

  constructor(opts: GeminiClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? ''
    this.modelName =
      opts.model ?? process.env.GEMINI_MODEL?.trim() ?? DEFAULT_GEMINI_MODEL
    this.configured = Boolean(apiKey) || Boolean(opts.generateText)

    if (opts.generateText) {
      this.generateText = opts.generateText
    } else if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: this.modelName })
      this.generateText = async (prompt: string) => {
        const result = await model.generateContent(prompt)
        return result.response.text()
      }
    } else {
      this.generateText = async () => {
        throw new Error('GEMINI_API_KEY not configured')
      }
    }
  }

  async estimateGas(ctx: Pick<BrainContext, 'networkLabel' | 'hardGasCapGwei'>): Promise<GasEstimate> {
    try {
      const text = await this.generateText(gasEstimatePrompt(ctx))
      const json = parseJsonObject(text)
      const gasPriceGwei = Number(json?.gasPriceGwei)
      const priorityFeeGwei = Number(json?.priorityFeeGwei)
      return {
        gasPriceGwei: Number.isFinite(gasPriceGwei) ? gasPriceGwei : 1,
        priorityFeeGwei: Number.isFinite(priorityFeeGwei) ? priorityFeeGwei : undefined,
        source: 'gemini',
        raw: text.slice(0, 500),
      }
    } catch (err) {
      console.warn('[gemini] gas estimate fallback', err instanceof Error ? err.message : err)
      return {
        gasPriceGwei: Math.min(1, ctx.hardGasCapGwei),
        source: 'fallback',
      }
    }
  }

  async interpretIntent(ctx: BrainContext): Promise<OperatorIntent> {
    if (!ctx.operatorMessage?.trim()) {
      return { kind: 'REBALANCE_IF_NEEDED', confidence: 1, note: 'no NL message' }
    }
    try {
      const text = await this.generateText(intentPrompt(ctx))
      const json = parseJsonObject(text)
      if (!json) {
        return { kind: 'UNKNOWN', confidence: 0, note: 'unparseable intent' }
      }
      const confidence = Number(json.confidence)
      return {
        kind: parseIntentKind(json.kind),
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
        note: typeof json.note === 'string' ? json.note.slice(0, 200) : undefined,
      }
    } catch (err) {
      console.warn('[gemini] intent fallback', err instanceof Error ? err.message : err)
      // Offline heuristic for common phrases when API fails
      return heuristicIntent(ctx.operatorMessage)
    }
  }

  async thoughtSummary(
    ctx: BrainContext,
    resolvedActionLabel: string,
    intentKind: string,
  ): Promise<string> {
    try {
      const text = await this.generateText(
        thoughtSummaryPrompt({
          ...ctx,
          resolvedAction: resolvedActionLabel,
          intentKind,
        }),
      )
      return text.replace(/\s+/g, ' ').trim().slice(0, 280)
    } catch {
      return defaultThoughtSummary(ctx, resolvedActionLabel, intentKind)
    }
  }

  /**
   * Full brain step: formula already run → Gemini assist → revalidate.
   * Order required by architecture: after formula, before guardrails.
   */
  async runBrain(ctx: BrainContext): Promise<BrainResult> {
    const notes: string[] = []
    const intent = await this.interpretIntent(ctx)
    const { action: resolvedAction, notes: intentNotes } = resolveActionFromIntent(
      ctx.formulaAction,
      intent,
    )
    notes.push(...intentNotes)

    const rawGas = await this.estimateGas(ctx)
    const { gas, notes: gasNotes } = clampGasEstimate(rawGas, ctx.hardGasCapGwei)
    notes.push(...gasNotes)

    const actionLabel =
      resolvedAction.type === 'SOFT_REBALANCE'
        ? `SOFT_REBALANCE(${resolvedAction.repayPct}%)`
        : resolvedAction.type

    const summary = await this.thoughtSummary(ctx, actionLabel, intent.kind)
    const llmReasoning: LlmReasoning = {
      model: this.modelName,
      thought_summary: summary,
      proposed_tool_call: proposedToolCall(resolvedAction, intent),
    }

    return {
      formulaAction: ctx.formulaAction,
      resolvedAction,
      intent,
      gas,
      llmReasoning,
      revalidated: true, // always revalidated by design
      notes,
    }
  }
}

export function createGeminiClient(opts?: GeminiClientOptions): GeminiClient {
  return new GeminiClient(opts)
}

/** Deterministic offline intent parser when Gemini unavailable */
export function heuristicIntent(message: string): OperatorIntent {
  const m = message.toLowerCase()
  if (/safe[\s-]?exit|full\s*exit|emergency/.test(m)) {
    return { kind: 'FORCE_SAFE', confidence: 0.7, note: 'heuristic' }
  }
  if (/force\s*(soft|rebalance)|repay\s*20/.test(m) && /force|now|do it/.test(m)) {
    return { kind: 'FORCE_SOFT', confidence: 0.7, note: 'heuristic' }
  }
  if (/if needed|rebalance if|repay.*if|check.*repay|should i/.test(m)) {
    return { kind: 'REBALANCE_IF_NEEDED', confidence: 0.8, note: 'heuristic' }
  }
  if (/status|health|check only|what is/.test(m)) {
    return { kind: 'CHECK_STATUS', confidence: 0.8, note: 'heuristic' }
  }
  if (/soft\s*rebalance|repay|rebalance/.test(m)) {
    return { kind: 'REBALANCE_IF_NEEDED', confidence: 0.6, note: 'heuristic' }
  }
  return { kind: 'UNKNOWN', confidence: 0.3, note: 'heuristic' }
}

function defaultThoughtSummary(
  ctx: BrainContext,
  resolvedAction: string,
  intentKind: string,
): string {
  return `HF ${ctx.position.health_factor} on ${ctx.position.network}; formula ${JSON.stringify(ctx.formulaAction)}; intent ${intentKind}; resolved ${resolvedAction}. Gemini assist only — amounts from policy.`
}
