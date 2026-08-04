import { EXECUTION_ROLES, isRole, type Role } from '@defi-sentinel/shared'
import { getServiceSupabase } from '../supabase/client'

export type RoleCheckReason = 'WALLET_NOT_FOUND' | 'ROLE_INSUFFICIENT'

export interface RoleCheckResult {
  allowed: boolean
  role: Role | null
  organizationId: string | null
  reason?: RoleCheckReason
}

export type MemberLookup = (
  walletAddress: string,
) => Promise<{ role: Role; organization_id: string } | null>

async function defaultLookup(walletAddress: string) {
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organization_id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error('[role-validator] lookup error', error.message)
    return null
  }
  if (!data || !isRole(data.role)) return null
  return { role: data.role as Role, organization_id: data.organization_id as string }
}

/**
 * Authoritative agent-side role check. Frontend JWT is never trusted for execution.
 */
export async function validateRole(
  walletAddress: string,
  requiredRoles: Role[] = EXECUTION_ROLES,
  lookup: MemberLookup = defaultLookup,
): Promise<RoleCheckResult> {
  const wallet = walletAddress.toLowerCase()
  const data = await lookup(wallet)

  if (!data) {
    return {
      allowed: false,
      role: null,
      organizationId: null,
      reason: 'WALLET_NOT_FOUND',
    }
  }

  if (!requiredRoles.includes(data.role)) {
    return {
      allowed: false,
      role: data.role,
      organizationId: data.organization_id,
      reason: 'ROLE_INSUFFICIENT',
    }
  }

  return {
    allowed: true,
    role: data.role,
    organizationId: data.organization_id,
  }
}
