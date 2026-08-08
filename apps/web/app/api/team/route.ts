import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Team roster — all authenticated org members (service role after session check). */
export async function GET() {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { session } = auth

  // Service role avoids recursive RLS on organization_members (migration 006).
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organization_members')
    .select('wallet_address, role, created_at')
    .eq('organization_id', session.organizationId)
    .order('role', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    members: data ?? [],
    role: session.role,
    wallet: session.wallet,
    organizationId: session.organizationId,
  })
}
