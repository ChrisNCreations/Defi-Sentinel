import { NextResponse } from 'next/server'
import { isRole, type Role } from '@defi-sentinel/shared'
import { requireSession } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAddress } from 'viem'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organization_members')
    .select('id, wallet_address, role, created_at')
    .eq('organization_id', session.organizationId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: { wallet?: string; role?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const wallet = body.wallet?.trim().toLowerCase()
  const role = body.role?.trim().toLowerCase()
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }
  if (!role || !isRole(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organization_members')
    .upsert(
      {
        organization_id: session.organizationId,
        wallet_address: wallet,
        role: role as Role,
      },
      { onConflict: 'organization_id,wallet_address' },
    )
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, member: data })
}

export async function PATCH(request: Request) {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  let body: { wallet?: string; role?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const wallet = body.wallet?.trim().toLowerCase()
  const role = body.role?.trim().toLowerCase()
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }
  if (!role || !isRole(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Prevent admin from demoting themselves accidentally without another admin
  if (wallet === session.wallet.toLowerCase() && role !== 'admin') {
    return NextResponse.json(
      { error: 'Cannot demote your own admin role from the UI' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organization_members')
    .update({ role: role as Role })
    .eq('organization_id', session.organizationId)
    .eq('wallet_address', wallet)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  return NextResponse.json({ ok: true, member: data })
}

export async function DELETE(request: Request) {
  const auth = await requireSession(['admin'])
  if ('error' in auth) return auth.error
  const { session } = auth

  const url = new URL(request.url)
  const wallet = (url.searchParams.get('wallet') ?? '').toLowerCase()
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })
  }
  if (wallet === session.wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot revoke your own membership' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('organization_id', session.organizationId)
    .eq('wallet_address', wallet)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
