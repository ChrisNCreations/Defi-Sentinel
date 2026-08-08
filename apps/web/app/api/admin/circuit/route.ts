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
    .from('circuit_breaker')
    .select('*')
    .eq('organization_id', session.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ circuit: data })
}

export async function POST(request: Request) {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: { action?: 'reset' | 'trip' }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = { action: 'reset' }
  }

  const action = body.action ?? 'reset'
  const supabase = createAdminClient()

  const patch =
    action === 'trip'
      ? {
          is_tripped: true,
          tripped_at: new Date().toISOString(),
          last_failure_reason: 'MANUAL_ADMIN_TRIP',
          last_failure_at: new Date().toISOString(),
        }
      : {
          is_tripped: false,
          failure_count: 0,
          tripped_at: null,
          last_failure_reason: null,
          last_failure_at: null,
        }

  const { data, error } = await supabase
    .from('circuit_breaker')
    .update(patch)
    .eq('organization_id', session.organizationId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, circuit: data })
}
