export const USER_ROLES = ['admin', 'operator', 'viewer'] as const

export type Role = (typeof USER_ROLES)[number]

export function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value)
}

/** Actions that may trigger KeeperHub execution */
export const EXECUTION_ROLES: Role[] = ['admin', 'operator']

/** Full audit trail read access */
export const AUDIT_READ_ROLES: Role[] = ['admin', 'operator']
