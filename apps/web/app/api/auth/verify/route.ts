import { NextResponse } from 'next/server'
import { SiweMessage } from 'siwe'
import {
  isPrivilegedRole,
  pickMembership,
  resolveDefaultOrganizationId,
  type Role,
} from '@defi-sentinel/shared'
import {
  normalizeWallet,
  verifySiweMessage,
  walletAuthEmail,
  walletAuthPassword,
} from '@/lib/auth/siwe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, roleHomePath } from '@/lib/supabase/server'
import { consumeNonce } from '@/lib/auth/nonce-store'

/**
 * Resolve org membership for a wallet after SIWE.
 * - admin / operator: must already be in organization_members (seed or admin-managed)
 * - everyone else: public viewer — auto-enrolled on the default org
 * - multi-org wallets: pick privileged + preferred default org (not maybeSingle)
 */
async function resolveMembership(
  admin: ReturnType<typeof createAdminClient>,
  address: string,
): Promise<{ role: Role; organization_id: string } | { error: string; status: number }> {
  const defaultOrgId = resolveDefaultOrganizationId(process.env.DEFAULT_ORGANIZATION_ID)

  // List all memberships — a wallet may belong to multiple orgs.
  const { data: rows, error: memberError } = await admin
    .from('organization_members')
    .select('role, organization_id')
    .eq('wallet_address', address)

  if (memberError) {
    console.error('[auth/verify] membership lookup', memberError)
    return { error: 'MEMBERSHIP_LOOKUP_FAILED', status: 500 }
  }

  const membership = pickMembership(rows, defaultOrgId)
  if (membership && isPrivilegedRole(membership.role)) {
    return membership
  }
  if (membership?.role === 'viewer') {
    return membership
  }

  // No row → public viewer auto-enroll on default org
  const { error: upsertError } = await admin.from('organization_members').upsert(
    {
      organization_id: defaultOrgId,
      wallet_address: address,
      role: 'viewer',
    },
    { onConflict: 'organization_id,wallet_address' },
  )

  if (upsertError) {
    console.error('[auth/verify] viewer auto-enroll', upsertError)
    return { error: 'VIEWER_ENROLL_FAILED', status: 500 }
  }

  return { role: 'viewer', organization_id: defaultOrgId }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string
      signature?: string
    }

    if (!body.message || !body.signature) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }

    const parsed = new SiweMessage(body.message)
    const address = normalizeWallet(parsed.address)

    if (!consumeNonce(address, parsed.nonce)) {
      return NextResponse.json({ error: 'INVALID_OR_EXPIRED_NONCE' }, { status: 401 })
    }

    const verified = await verifySiweMessage(body.message, body.signature)
    if (verified.address !== address) {
      return NextResponse.json({ error: 'ADDRESS_MISMATCH' }, { status: 401 })
    }

    const admin = createAdminClient()
    const membership = await resolveMembership(admin, address)
    if ('error' in membership) {
      return NextResponse.json({ error: membership.error }, { status: membership.status })
    }

    const email = walletAuthEmail(address)
    const password = walletAuthPassword(address)

    // Upsert auth user (deterministic email/password after SIWE)
    let userId: string | undefined

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        wallet_address: address,
        role: membership.role,
      },
    })

    if (created?.user) {
      userId = created.user.id
    } else {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })
      if (listError) {
        console.error('[auth/verify] list users', listError, createError)
        return NextResponse.json({ error: 'USER_LOOKUP_FAILED' }, { status: 500 })
      }
      const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (!existing) {
        console.error('[auth/verify] create user', createError)
        return NextResponse.json({ error: 'USER_CREATE_FAILED' }, { status: 500 })
      }
      userId = existing.id
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          wallet_address: address,
          role: membership.role,
        },
      })
      if (updateError) {
        console.error('[auth/verify] update user', updateError)
        return NextResponse.json({ error: 'USER_UPDATE_FAILED' }, { status: 500 })
      }
    }

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: userId,
        wallet_address: address,
        display_name: `${membership.role} · ${address.slice(0, 6)}…${address.slice(-4)}`,
      },
      { onConflict: 'id' },
    )

    if (profileError) {
      console.error('[auth/verify] profile upsert', profileError)
      return NextResponse.json({ error: 'PROFILE_UPSERT_FAILED' }, { status: 500 })
    }

    const supabase = await createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      console.error('[auth/verify] signIn', signInError)
      return NextResponse.json({ error: 'SESSION_CREATE_FAILED' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      wallet: address,
      role: membership.role,
      organizationId: membership.organization_id,
      redirectTo: roleHomePath(membership.role),
    })
  } catch (err) {
    console.error('[auth/verify]', err)
    return NextResponse.json(
      {
        error: 'SIWE_FAILED',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 401 },
    )
  }
}
