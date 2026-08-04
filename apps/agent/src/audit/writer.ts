import { randomUUID } from 'crypto'
import type {
  AuditLogPayload,
  ExecutionStatus,
  GuardrailStatus,
  PositionState,
  TriggerType,
} from '@defi-sentinel/shared'
import { getServiceSupabase, hasSupabaseConfig } from '../supabase/client'

export interface WriteAuditInput {
  organizationId: string
  triggerType: TriggerType
  actorWallet?: string
  position: PositionState
  guardrailStatus: GuardrailStatus
  rulesChecked: string[]
  violations: string[]
  executionStatus?: ExecutionStatus
  executionDetails?: AuditLogPayload['execution_details']
  llmReasoning?: AuditLogPayload['llm_reasoning']
  dryRun?: boolean
}

export function buildAuditPayload(input: WriteAuditInput): AuditLogPayload {
  const executionId = randomUUID()
  const payload: AuditLogPayload = {
    execution_id: executionId,
    timestamp: new Date().toISOString(),
    trigger_type: input.triggerType,
    organization_id: input.organizationId,
    actor_wallet: input.actorWallet,
    position_state: {
      protocol: input.position.protocol,
      network: input.position.network,
      target_wallet: input.position.target_wallet,
      health_factor: input.position.health_factor,
      collateral_usd: input.position.collateral_usd,
      debt_usd: input.position.debt_usd,
    },
    llm_reasoning: input.llmReasoning,
    guardrail_validation: {
      status: input.guardrailStatus,
      rules_checked: input.rulesChecked,
      violations: input.violations,
    },
  }

  if (input.executionDetails) {
    payload.execution_details = input.executionDetails
  } else if (input.guardrailStatus === 'REJECTED' || input.executionStatus) {
    payload.execution_details = {
      keeperhub_workflow_id: process.env.KEEPERHUB_WORKFLOW_ID ?? 'pending',
      simulation_status: input.guardrailStatus === 'REJECTED' ? 'SKIPPED' : 'PENDING',
      execution_status: input.executionStatus ?? 'REJECTED',
      retry_attempts: 0,
    }
  }

  return payload
}

/**
 * Insert append-only audit row. Service role has INSERT only (migration 003).
 * When Supabase is not configured or dryRun=true, logs to console and returns payload.
 */
export async function writeAuditLog(input: WriteAuditInput): Promise<AuditLogPayload> {
  const payload = buildAuditPayload(input)

  if (input.dryRun || !hasSupabaseConfig()) {
    console.log('[audit] dry-run / no supabase — would insert:', JSON.stringify(payload, null, 2))
    return payload
  }

  const supabase = getServiceSupabase()
  const { error } = await supabase.from('audit_logs').insert({
    execution_id: payload.execution_id,
    organization_id: payload.organization_id,
    timestamp: payload.timestamp,
    trigger_type: payload.trigger_type,
    actor_wallet: payload.actor_wallet ?? null,
    position_state: payload.position_state,
    intelligence_gate: null,
    llm_reasoning: payload.llm_reasoning ?? null,
    guardrail_validation: payload.guardrail_validation,
    execution_details: payload.execution_details ?? null,
  })

  if (error) {
    console.error('[audit] insert failed', error.message)
    throw new Error(`AUDIT_WRITE_FAILED: ${error.message}`)
  }

  console.log(`[audit] recorded ${payload.execution_id} (${payload.guardrail_validation.status})`)
  return payload
}
