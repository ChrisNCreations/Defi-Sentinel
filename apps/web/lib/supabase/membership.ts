import {
  pickMembership,
  resolveDefaultOrganizationId,
  type Role,
} from '@defi-sentinel/shared'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resolve membership for a wallet using the service role.
 *
 * Authenticated PostgREST reads of organization_members can fail with
 * PostgreSQL 42P17 (infinite recursion) when policies self-select the same
 * table. After JWT + profile are verified, service-role lookup is safe and
 * avoids that RLS bug (fixed properly in migration 006).
 */
export async function resolveMembershipForWallet(
  wallet: string,
): Promise<{ role: Role; organization_id: string } | null> {
  const address = wallet.toLowerCase()
  const defaultOrgId = resolveDefaultOrganizationId(process.env.DEFAULT_ORGANIZATION_ID)

  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('organization_members')
      .select('role, organization_id')
      .eq('wallet_address', address)

    if (error) {
      console.error('[membership] lookup failed', error.code, error.message)
      return null
    }

    return pickMembership(rows, defaultOrgId)
  } catch (err) {
    console.error('[membership] admin client error', err)
    return null
  }
}
