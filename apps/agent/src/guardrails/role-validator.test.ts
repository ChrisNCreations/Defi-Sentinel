import { describe, expect, it } from 'vitest'
import { validateRole } from './role-validator'

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
