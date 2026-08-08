import { describe, expect, it } from 'vitest'
import { DEFAULT_ORGANIZATION_ID, pickMembership } from '@defi-sentinel/shared'
import { validateRole } from './role-validator'

describe('pickMembership', () => {
  const seed = DEFAULT_ORGANIZATION_ID
  const other = '5e88f049-d70e-4057-b832-2a26c92d5d77'

  it('prefers privileged role on default org when multi-org', () => {
    const picked = pickMembership(
      [
        { role: 'admin', organization_id: other },
        { role: 'admin', organization_id: seed },
      ],
      seed,
    )
    expect(picked).toEqual({ role: 'admin', organization_id: seed })
  })

  it('returns null for empty rows', () => {
    expect(pickMembership([])).toBeNull()
    expect(pickMembership(null)).toBeNull()
  })

  it('prefers viewer on default org over other org viewer', () => {
    const picked = pickMembership(
      [
        { role: 'viewer', organization_id: other },
        { role: 'viewer', organization_id: seed },
      ],
      seed,
    )
    expect(picked).toEqual({ role: 'viewer', organization_id: seed })
  })
})

describe('validateRole', () => {
  it('allows operator for execution roles', async () => {
    const result = await validateRole('0xAbc', ['admin', 'operator'], async () => ({
      role: 'operator',
      organization_id: 'org-1',
    }))
    expect(result.allowed).toBe(true)
    expect(result.role).toBe('operator')
    expect(result.organizationId).toBe('org-1')
  })

  it('rejects viewer with ROLE_INSUFFICIENT', async () => {
    const result = await validateRole(
      '0xViewer',
      ['admin', 'operator'],
      async () => ({ role: 'viewer', organization_id: 'org-1' }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('ROLE_INSUFFICIENT')
    expect(result.role).toBe('viewer')
  })

  it('rejects unknown wallet with WALLET_NOT_FOUND', async () => {
    const result = await validateRole('0xDead', ['operator'], async () => null)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('WALLET_NOT_FOUND')
    expect(result.organizationId).toBeNull()
  })

  it('allows admin', async () => {
    const result = await validateRole('0xAdmin', ['admin', 'operator'], async () => ({
      role: 'admin',
      organization_id: 'org-1',
    }))
    expect(result.allowed).toBe(true)
  })
})
