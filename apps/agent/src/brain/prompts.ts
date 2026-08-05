import type { BrainContext } from './types'

export function gasEstimatePrompt(ctx: Pick<BrainContext, 'networkLabel' | 'hardGasCapGwei'>): string {
  return `You estimate EVM gas for a DeFi rebalance on testnet.
Network: ${ctx.networkLabel}
Hard gas cap (gwei): ${ctx.hardGasCapGwei}

Return ONLY compact JSON (no markdown):
{"gasPriceGwei": <number>, "priorityFeeGwei": <number>, "rationale": "<one short sentence>"}

Rules:
- Prefer low testnet values (typically 0.01–5 gwei on L2s, higher on eth sepolia).
- Apply a 10–20% safety buffer above a typical base fee.
- gasPriceGwei MUST be <= ${ctx.hardGasCapGwei}.
- Do not invent wallet keys or transactions.`
}

export function intentPrompt(ctx: BrainContext): string {
  const msg = ctx.operatorMessage?.trim() || '(no message — scheduled / status check)'
  return `You interpret an Operator natural-language command for DeFi Sentinel.
You do NOT decide repay percentages. The deterministic formula already computed an action.

Current position:
- network: ${ctx.position.network}
- wallet: ${ctx.position.target_wallet}
- health_factor: ${ctx.position.health_factor}
- collateral_usd: ${ctx.position.collateral_usd}
- debt_usd: ${ctx.position.debt_usd}

Formula action (authoritative for risk): ${JSON.stringify(ctx.formulaAction)}
Soft rebalance repay % when used: ${ctx.softRepayPct} (fixed by policy, not by you)

Operator message:
"""${msg}"""

Return ONLY compact JSON:
{"kind":"CHECK_STATUS"|"REBALANCE_IF_NEEDED"|"FORCE_SOFT"|"FORCE_SAFE"|"UNKNOWN","confidence":0-1,"note":"<short>"}

Meaning:
- CHECK_STATUS: only report / no execution intent
- REBALANCE_IF_NEEDED: follow formula (e.g. "repay 20% if needed")
- FORCE_SOFT: operator forces soft rebalance
- FORCE_SAFE: operator forces safe exit
- UNKNOWN: unclear

Never propose a custom repay percentage.`
}

export function thoughtSummaryPrompt(ctx: BrainContext & { resolvedAction: string; intentKind: string }): string {
  return `Write a 1–2 sentence human-readable audit summary for DeFi Sentinel.
No markdown. No private keys. Be factual.

Position HF=${ctx.position.health_factor}, debt_usd=${ctx.position.debt_usd}, network=${ctx.position.network}.
Formula action: ${JSON.stringify(ctx.formulaAction)}
Operator intent: ${ctx.intentKind}
Resolved action: ${ctx.resolvedAction}
Operator message: ${ctx.operatorMessage?.slice(0, 200) || 'n/a'}

Return plain text only (max 280 chars).`
}
