import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireSession(['admin', 'operator'])
  if ('error' in auth) return auth.error
  const { session } = auth

  const url = new URL(request.url)
  const trigger = url.searchParams.get('trigger') // SCHEDULED_CRON | MANUAL_OPERATOR
  const status = url.searchParams.get('status') // PASSED | REJECTED | CONFIRMED | …
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get('pageSize') ?? 10) || 10), 100)
  const offset = (page - 1) * pageSize

  // Service role after role check — audit RLS joins organization_members (recursive until 006).
  const supabase = createAdminClient()

  let query = supabase
    .from('audit_logs')
    .select(
      'id, execution_id, timestamp, trigger_type, actor_wallet, position_state, intelligence_gate, llm_reasoning, guardrail_validation, execution_details',
      { count: 'exact' },
    )
    .eq('organization_id', session.organizationId)
    .order('timestamp', { ascending: false })

  if (trigger) query = query.eq('trigger_type', trigger)
  if (from) query = query.gte('timestamp', from)
  if (to) query = query.lte('timestamp', to)

  const { data, error, count } = await query.range(offset, offset + pageSize - 1)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let rows = data ?? []
  if (status) {
    const s = status.toUpperCase()
    rows = rows.filter((row) => {
      const g = row.guardrail_validation as { status?: string } | null
      const e = row.execution_details as { execution_status?: string } | null
      return g?.status === s || e?.execution_status === s
    })
  }

  // Real summary counts (head queries are cheap and do not return rows).
  const countBuilder = () =>
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)

  const [sCron, sManual, sOk, sBad] = await Promise.all([
    countBuilder().eq('trigger_type', 'SCHEDULED_CRON'),
    countBuilder().eq('trigger_type', 'MANUAL_OPERATOR'),
    countBuilder().or(
      'execution_details->>execution_status.eq.CONFIRMED,guardrail_validation->>status.eq.PASSED',
    ),
    countBuilder().or(
      'guardrail_validation->>status.eq.REJECTED,execution_details->>execution_status.eq.REJECTED',
    ),
  ])

  return NextResponse.json({
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
    counts: {
      all: count ?? rows.length,
      scheduled: sCron.count ?? 0,
      manual: sManual.count ?? 0,
      success: sOk.count ?? 0,
      failed: sBad.count ?? 0,
    },
  })
}