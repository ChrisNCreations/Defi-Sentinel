import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hard_limits')
    .select(
      'max_repayment_pct, max_gas_price_gwei, max_consecutive_failures, allowed_contracts, updated_at, updated_by',
    )
    .eq('organization_id', session.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ limits: data })
}

export async function PATCH(request: Request) {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: {
    max_repayment_pct?: number
    max_gas_price_gwei?: number
    max_consecutive_failures?: number
    allowed_contracts?: string[]
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: session.wallet,
  }

  if (body.max_repayment_pct !== undefined) {
    const n = Number(body.max_repayment_pct)
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return NextResponse.json({ error: 'Invalid max_repayment_pct' }, { status: 400 })
    }
    patch.max_repayment_pct = n
  }
  if (body.max_gas_price_gwei !== undefined) {
    const n = Number(body.max_gas_price_gwei)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'Invalid max_gas_price_gwei' }, { status: 400 })
    }
    patch.max_gas_price_gwei = n
  }
  if (body.max_consecutive_failures !== undefined) {
    const n = Number(body.max_consecutive_failures)
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      return NextResponse.json({ error: 'Invalid max_consecutive_failures' }, { status: 400 })
    }
    patch.max_consecutive_failures = n
  }
  if (body.allowed_contracts !== undefined) {
    if (!Array.isArray(body.allowed_contracts)) {
      return NextResponse.json({ error: 'allowed_contracts must be an array' }, { status: 400 })
    }
    patch.allowed_contracts = body.allowed_contracts.map((c) => String(c).toLowerCase())
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hard_limits')
    .update(patch)
    .eq('organization_id', session.organizationId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, limits: data })
}
