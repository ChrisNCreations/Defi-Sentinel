export type TriggerType = 'SCHEDULED_CRON' | 'MANUAL_OPERATOR'

export type GuardrailStatus = 'PASSED' | 'REJECTED'

export type ExecutionStatus =
  | 'CONFIRMED'
  | 'REVERTED'
  | 'GAS_EXCEEDED'
  | 'CIRCUIT_BREAKER_HALT'
  | 'SIMULATION_FAILED'
  | 'REJECTED'
  | 'PENDING'

export interface AuditLogPayload {
  execution_id: string
  timestamp: string
  trigger_type: TriggerType
  organization_id: string
  actor_wallet?: string
  position_state: {
    protocol: 'AaveV3'
    network: string
    target_wallet: string
    health_factor: number
    collateral_usd: number
    debt_usd: number
  }
  llm_reasoning?: {
    model: 'gemini-2.5-flash'
    thought_summary: string
    proposed_tool_call: string
  }
  guardrail_validation: {
    status: GuardrailStatus
    rules_checked: string[]
    violations: string[]
  }
  execution_details?: {
    keeperhub_workflow_id: string
    tx_hash?: string
    simulation_status: string
    gas_used?: string
    effective_gas_price_gwei?: string
    execution_status: ExecutionStatus
    retry_attempts: number
  }
}
