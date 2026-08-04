import { describe, expect, it } from 'vitest'
import { buildAuditPayload } from './writer'

describe('buildAuditPayload', () => {
  it('builds REJECTED payload with execution_details', () => {
    const payload = buildAuditPayload({
      organizationId: 'org-1',
      triggerType: 'MANUAL_OPERATOR',
      actorWallet: '0xabc',
      position: {
        protocol: 'AaveV3',
        network: 'Base Sepolia',
        target_wallet: '0x1',
        health_factor: 1.2,
        collateral_usd: 100,
        debt_usd: 80,
      },
      guardrailStatus: 'REJECTED',
      rulesChecked: ['ROLE_VALIDATION'],
      violations: ['ROLE_INSUFFICIENT'],
    })

    expect(payload.guardrail_validation.status).toBe('REJECTED')
    expect(payload.guardrail_validation.violations).toContain('ROLE_INSUFFICIENT')
    expect(payload.execution_details?.execution_status).toBe('REJECTED')
    expect(payload.execution_id).toBeTruthy()
  })
})
