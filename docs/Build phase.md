# build-plan.md
## Autonomous Treasury Rebalancer & Yield Sentinel
### Testnet Phase – Implementation Roadmap

This plan is ordered so that each phase produces a working, testable increment.  
A coding assistant should complete one phase fully (including basic tests) before moving to the next.

---

## Phase 0 – Project Scaffolding & Tooling
**Goal:** Empty but fully configured monorepo that both apps can run.

### Tasks
- [x] Initialize monorepo (`pnpm` workspaces or Turborepo)
- [x] Create `apps/web` (Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui)
- [x] Create `apps/agent` (Node.js + TypeScript)
- [x] Create `packages/shared` (shared types)
- [x] Set up ESLint, Prettier, tsconfig paths
- [x] Add basic README and `.env.example` files
- [x] Configure Supabase local project (`supabase init` + `config.toml`)
- [ ] Add Foundry (optional) only if local contract helpers are needed later

### Exit Criteria
- `pnpm dev` starts the Next.js app
- `pnpm --filter agent dev` starts the empty agent process
- Shared types can be imported from both apps

---

## Phase 1 – Supabase Schema, Auth & Roles
**Goal:** Working SIWE login + role system.

### Tasks
- [x] Write migration `001_initial_schema.sql` (organizations, profiles, organization_members, hard_limits, circuit_breaker, audit_logs)
- [x] Write migration `002_rls_policies.sql`
- [x] Write migration `003_audit_append_only.sql` (explicitly revoke UPDATE/DELETE)
- [x] Implement Supabase SIWE (or use `@supabase/auth-helpers` + wagmi/RainbowKit)
- [x] Create `lib/supabase/client.ts`, `server.ts`, `middleware.ts`
- [x] Implement `getSessionAndRole()` helper
- [x] Protect all routes under `(protected)` with middleware
- [x] Seed one Admin wallet and one Operator wallet for testing
- [x] Basic Login page (`/login`) that redirects by role

### Exit Criteria
- User can connect wallet → sign SIWE → land on correct dashboard
- `organization_members` correctly returns role
- RLS prevents Viewer from reading audit_logs
- Service role can INSERT into audit_logs but cannot UPDATE/DELETE

---

## Phase 2 – Core Agent Skeleton & Formula Engine
**Goal:** Agent can read on-chain data and decide an action (no execution yet).

### Tasks
- [x] Agent entry point (`src/index.ts`) with graceful shutdown
- [x] Aave V3 reader using `viem` or `ethers` → `getUserAccountData`
- [x] Pure formula engine (`formula/health-factor.ts`)
  - HF > 1.30 → NONE
  - HF ≤ 1.30 → SOFT_REBALANCE (20 %)
  - HF ≤ 1.10 → SAFE_EXIT
- [x] Shared types for Action, PositionState, etc.
- [x] Simple CLI or test script that prints decision for a given wallet
- [x] Environment variable loading (RPC URLs, Aave pool addresses)

### Exit Criteria
- Running the agent against a testnet wallet correctly prints the expected action
- Formula is 100 % deterministic (no Gemini involved)

---

## Phase 3 – Guardrails, Role Validator & Circuit Breaker
**Goal:** All safety checks work before any external call.

### Tasks
- [x] `guardrails/role-validator.ts` (Supabase service-role lookup)
- [x] `guardrails/hard-limits.ts` (read from `hard_limits` table)
- [x] `guardrails/circuit-breaker.ts` (3-strike logic + Discord alert stub)
- [x] Middleware that runs on every potential execution path:
  1. Role check
  2. Circuit-breaker check
  3. Hard-limits check
  4. Aave close-factor awareness
- [x] Unit tests for each guardrail
- [x] Audit writer skeleton that can record REJECTED actions

### Exit Criteria
- Operator wallet passes, Viewer wallet is rejected with `ROLE_INSUFFICIENT`
- Tripping the circuit breaker stops further execution
- Hard limit violations are rejected and logged

---

## Phase 4 – KeeperHub Integration (Execution Path)
**Goal:** Agent can submit a real transaction via KeeperHub + Turnkey.

### Tasks
- [x] KeeperHub client (`keeperhub/client.ts`) – **REST default**
- [x] Optional MCP transport (`execute_workflow` + `get_execution` only; no marketplace)
- [x] Ops CLI: `agent-doctor`, `list-workflows`, optional `kh` wrapper
- [x] Map Action → KeeperHub workflow payload
- [x] Handle simulation result, tx hash, retries
- [x] Respect hard gas cap
- [x] Write full execution result into audit_logs
- [ ] Test Soft Rebalance and Safe-Exit on Base Sepolia with faucet funds *(requires Aave repay steps in KH workflow)*
- [x] Confirm Turnkey never exposes private keys to the agent

### Exit Criteria
- Forced Soft Rebalance from an Operator wallet produces a confirmed tx on Basescan
- Audit log contains the complete structured payload
- Failed simulation or gas-cap breach aborts cleanly

**Note:** Product path does **not** call MCP `create_workflow` / `update_workflow`. Workflow graphs are configured in the KeeperHub UI and pinned by `KEEPERHUB_WORKFLOW_ID`.

---

## Phase 5 – Gemini Integration (Brain)
**Goal:** Natural language + gas estimation + human-readable audit text.

### Tasks
- [x] Gemini client (`brain/gemini.ts`) using official SDK
- [x] Prompt templates for:
  - Gas / priority-fee estimation
  - Natural-language intent parsing
  - Short `thought_summary` generation
- [x] Wire Gemini **after** formula decision and **before** guardrails final check
- [x] Treat Gemini output as untrusted – always re-validate
- [x] Add `llm_reasoning` section to audit log

### Exit Criteria
- Operator can type “repay 20 % if needed” and the agent executes correctly
- Audit log shows a clear human-readable summary
- Gemini cannot bypass hard limits

---

## Phase 6 – Scheduled Poller
**Goal:** Fully autonomous 6-hour loop.

### Tasks
- [x] `poller/scheduler.ts` (setInterval + single-flight ticks)
- [x] Shared `cycle/run-cycle.ts` (formula → Gemini → guardrails → KeeperHub)
- [x] On each tick:
  1. Read position
  2. Run formula
  3. If action needed → full guardrail + Gemini + KeeperHub path
  4. Always write audit record (even for NONE)
- [x] Graceful handling of RPC failures (soft failure; daemon continues)
- [x] Logging of next run time
- [x] Default `dev`/`start` runs poller (`--once-cycle` for single tick; `--idle` to park)
- [x] Env: `TARGET_WALLET`, `ORGANIZATION_ID`, `POLL_INTERVAL_MS` / `POLL_INTERVAL_HOURS`

### Exit Criteria
- Agent runs unattended for 24 h+ and correctly acts (or does nothing) every 6 hours
- Circuit breaker works under repeated failures

---

## Phase 7 – Frontend Pages (Full UI)
**Goal:** Complete operator and admin experience.

### Tasks
- [x] `/dashboard` – live HF, collateral, debt, circuit status, next poll, natural-language box + Force Soft / Force Safe-Exit buttons 
- [x] `/audit` – filterable table + expandable row with full payload
- [x] `/admin` – hard limits form, member management, circuit reset, Discord webhook notes
- [x] `/team` – simple role list (all authenticated roles)
- [x] Real-time status updates (15s polling) after manual actions
- [x] Role-based UI (hide buttons the user cannot use)
- [x] Agent HTTP `serve` mode + web `AGENT_BASE_URL` proxy for manual actions
- [x] Migration `005` – all members can read org roster

### Exit Criteria
- Every role sees exactly the correct UI
- Manual force action from UI produces the same audit trail as the agent CLI
- Admin can change limits and revoke Operators; changes take effect immediately

---

## Phase 8 – Observability, Alerts & Polish
**Goal:** Production-ready testnet experience.

### Tasks
- [ ] Discord webhook for circuit-breaker and liquidation alerts
- [ ] Better error messages surfaced to the UI
- [ ] Audit log retention job (delete > 14 days) – optional Supabase cron
- [ ] Health-check endpoint for the agent
- [ ] Basic metrics (success/failure counts)
- [ ] End-to-end test script that simulates a full Soft Rebalance cycle
- [ ] Documentation updates (README, how to add a new Operator, etc.)

### Exit Criteria
- Team can operate the system for a week on testnet with only faucet funds
- Any failure is visible in the UI and Discord within minutes
- New developer can onboard using only the docs

---


## Phase 9 – (Optional / Future) x402 Micro-Payments
**Status:** Deferred – only implement if cost model changes.

- Design pay-per-request header flow
- Treasury pays from the Turnkey wallet
- Gate Gemini or RPC calls behind successful micro-payment

---

## Suggested Order of Work for a Coding Assistant

1. Phase 0 → 1 (foundation + auth)
2. Phase 2 → 3 (agent brain without external calls)
3. Phase 4 (real execution)
4. Phase 5 (Gemini)
5. Phase 6 (autonomy)
6. Phase 7 (UI)
7. Phase 8 (hardening)

Each phase should end with a short demo script or checklist that proves the exit criteria.

---

**Document Status**  
Ready for implementation. Update this file with checkmarks as phases are completed. 