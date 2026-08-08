import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-auth'
import { agentAction, isAgentConfigured } from '@/lib/agent-client'

export const dynamic = 'force-dynamic'

/**
 * Operator/Admin manual actions → agent HTTP (same path as CLI).
 * Body: { kind: 'chat'|'force-soft'|'force-safe', message?, dryRunKeeper? }
 */
export async function POST(request: Request) {
  const auth = await requireSession(['admin', 'operator'])
  if ('error' in auth) return auth.error
  const { session } = auth

  if (!isAgentConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'AGENT_UNAVAILABLE: set AGENT_BASE_URL in apps/web and run `pnpm --filter agent serve`',
      },
      { status: 503 },
    )
  }

  let body: {
    kind?: string
    message?: string
    dryRunKeeper?: boolean
    execute?: boolean
    mockHf?: number
    targetWallet?: string
    network?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 })
  }

  const kindRaw = (body.kind ?? 'chat').toLowerCase()
  const kind =
    kindRaw === 'force-soft' || kindRaw === 'force_soft'
      ? 'force-soft'
      : kindRaw === 'force-safe' || kindRaw === 'force_safe' || kindRaw === 'safe-exit'
        ? 'force-safe'
        : kindRaw === 'guard'
          ? 'guard'
          : 'chat'

  if (kind === 'chat' && !body.message?.trim()) {
    return NextResponse.json({ ok: false, error: 'MESSAGE_REQUIRED' }, { status: 400 })
  }

  const targetWallet =
    body.targetWallet ??
    process.env.TARGET_WALLET ??
    process.env.NEXT_PUBLIC_TARGET_WALLET ??
    session.wallet

  // Live KH only when ACTIONS_LIVE=1 (or client forces dryRunKeeper false + live flag)
  const live =
    process.env.ACTIONS_LIVE === '1' ||
    process.env.ACTIONS_LIVE === 'true' ||
    process.env.NEXT_PUBLIC_ACTIONS_LIVE === '1'
  const dryRunKeeper =
    body.dryRunKeeper === true || (!live && body.dryRunKeeper !== false) || !live

  const result = await agentAction({
    kind,
    actorWallet: session.wallet,
    targetWallet,
    organizationId: session.organizationId,
    message: body.message,
    network: body.network,
    mockHf: body.mockHf,
    execute: body.execute !== false,
    dryRunKeeper,
    useBrain: true,
    scheduled: false,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 422 })
}
