export const USER_ROLES = ['admin', 'operator', 'viewer'] as const

export type Role = (typeof USER_ROLES)[number]

export function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value)
}

/** Actions that may trigger KeeperHub execution */
export const EXECUTION_ROLES: Role[] = ['admin', 'operator']

/** Full audit trail read access */
export const AUDIT_READ_ROLES: Role[] = ['admin', 'operator']

/**
 * Default org for public SIWE viewers (matches supabase/migrations/004_seed.sql).
 * Override with DEFAULT_ORGANIZATION_ID env when multi-org is introduced.
 */
export const DEFAULT_ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001'

/** Privileged roles that must never be auto-assigned on public connect */
export function isPrivilegedRole(role: Role): boolean {
  return role === 'admin' || role === 'operator'
}

/** One row from organization_members (wallet may have several orgs). */
export interface MembershipRow {
  role: string
  organization_id: string
}

export interface PickedMembership {
  role: Role
  organization_id: string
}

/**
 * Choose a single membership when a wallet belongs to multiple orgs.
 * Prefer privileged roles, then defaultOrgId, then first viewer.
 */
export function pickMembership(
  rows: MembershipRow[] | null | undefined,
  defaultOrgId: string = DEFAULT_ORGANIZATION_ID,
): PickedMembership | null {
  if (!rows?.length) return null

  const valid = rows.filter(
    (r): r is MembershipRow & { role: Role } =>
      Boolean(r.organization_id) && isRole(r.role),
  )
  if (!valid.length) return null

  const privileged = valid.filter((r) => isPrivilegedRole(r.role))
  if (privileged.length) {
    const preferred =
      privileged.find((r) => r.organization_id === defaultOrgId) ?? privileged[0]
    return { role: preferred.role, organization_id: preferred.organization_id }
  }

  const viewers = valid.filter((r) => r.role === 'viewer')
  if (viewers.length) {
    const preferred =
      viewers.find((r) => r.organization_id === defaultOrgId) ?? viewers[0]
    return { role: preferred.role, organization_id: preferred.organization_id }
  }

  return null
}

/** Resolve default org id from env (web/agent) with seed fallback. */
export function resolveDefaultOrganizationId(
  envValue?: string | null,
): string {
  const trimmed = envValue?.trim()
  return trimmed || DEFAULT_ORGANIZATION_ID
}
