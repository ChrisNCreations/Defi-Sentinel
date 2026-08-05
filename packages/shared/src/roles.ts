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
