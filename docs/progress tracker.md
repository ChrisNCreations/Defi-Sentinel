# Progress Tracker

## Phase 0 – Project Scaffolding & Tooling

- [x] Initialize monorepo (`pnpm` workspaces)
- [x] Create `apps/web` (Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui)
- [x] Create `apps/agent` (Node.js + TypeScript stub)
- [x] Create `packages/shared` (shared types & constants)
- [x] Design tokens in `apps/web/app/globals.css` + Tailwind theme
- [x] shadcn/ui (`Button`, `Card`) aligned to design tokens + `/public` mockups
- [x] Login shell page (visual only; SIWE later)
- [x] ESLint / Prettier / tsconfig paths
- [x] README and `.env.example` files
- [x] Supabase folder + minimal `config.toml` + migrations dir
- [x] `pnpm install` + verify web/agent start (type-check, `agent once`, `next build`)

## Phase 1 – Supabase Schema, Auth & Roles

- [x] Migrations `001`–`003` + seed `004` (org, members, hard limits, circuit, audit)
- [x] RLS policies (viewer blocked from `audit_logs`)
- [x] Audit append-only (revoke UPDATE/DELETE + triggers)
- [x] Supabase client / server / admin helpers + `getSessionAndRole()`
- [x] Middleware protection for `/dashboard` `/actions` `/audit` `/admin` `/team`
- [x] SIWE login (RainbowKit + wagmi + `/api/auth/nonce` + `/api/auth/verify`)
- [x] Seed Admin / Operator / Viewer wallets
- [x] Login redirects by role (admin → `/admin`, others → `/dashboard`)
- [x] Protected app shell (sidebar matching `/public` mockups)

## Phase 2 – Core Agent Skeleton & Formula Engine

- [x] Agent entry point with graceful shutdown
- [x] Aave V3 reader (`viem` → `getUserAccountData`)
- [x] Pure formula engine (`formula/health-factor.ts`)
  - HF > 1.30 → NONE
  - HF ≤ 1.30 → SOFT_REBALANCE (20 %)
  - HF ≤ 1.10 → SAFE_EXIT
- [x] Shared types for Action, PositionState, DecisionResult
- [x] CLI: `pnpm --filter agent decide -- --wallet 0x…`
- [x] Mock HF path: `--mock-hf` (no RPC)
- [x] Environment variable loading (RPC URLs, Aave pool addresses)
- [x] Unit tests for formula + HF decoding

## Phase 3 – Guardrails, Role Validator & Circuit Breaker

- [x] `guardrails/role-validator.ts` (service-role lookup + DI for tests)
- [x] `guardrails/hard-limits.ts` (pure check + Supabase fetch)
- [x] `guardrails/circuit-breaker.ts` (3-strike + Discord stub)
- [x] `guardrails/close-factor.ts` (Aave 50% awareness)
- [x] `guardrails/pipeline.ts` middleware (role → circuit → hard limits → close factor)
- [x] `audit/writer.ts` skeleton (REJECTED / PASSED inserts, dry-run)
- [x] Unit tests for each guardrail + pipeline
- [x] CLI: `force-soft`, `force-safe`, `guard`

## Phase 4 – KeeperHub Integration

- [x] `keeperhub/client.ts` REST client (execute + poll executions)
- [x] Map Action → workflow `input` payload (Turnkey signing only)
- [x] Simulation/status handling, retries, gas-cap abort
- [x] Full execution result → `audit_logs`
- [x] Unit tests + live execute against org workflow
- [x] Workflow blueprint `keeperhub/workflows/aave-rebalance.json`

## Phase 5 – Gemini Integration (Brain)

- [x] `brain/gemini.ts` + prompts + revalidate (clamp gas, resolve intent)
- [x] Wire formula → brain → guardrails → KeeperHub
- [x] `llm_reasoning` on audit rows
- [x] CLI `chat --message "…"`
- [x] Unit tests (mocked Gemini + heuristics)

## Phase 4b – MCP + CLI (additive)

- [x] `KeeperHubExecutor` interface; REST default
- [x] Optional MCP client (`execute_workflow` + `get_execution` only; no marketplace)
- [x] CLI: `agent-doctor`, `list-workflows`, `--transport rest|mcp`, optional `kh` wrapper
- [x] Docs: `docs/keeperhub-integration.md` + library/dev/architecture updates

## Phase 6 – Scheduled Poller

- [x] `poller/scheduler.ts` (setInterval, single-flight, next-run logging)
- [x] `poller/tick.ts` + shared `cycle/run-cycle.ts`
- [x] Default daemon mode runs poller (not idle)
- [x] CLI: `once-cycle`, `poll`; env `TARGET_WALLET`, `ORGANIZATION_ID`, interval overrides
- [x] Audit NONE on every cycle when writeAudit enabled
- [x] Soft RPC failures do not kill the process
- [x] Unit tests for scheduler + cycle

## Phase 7 – Frontend Pages (Full UI)

- [x] Dashboard: HF ring, metrics, circuit, recent audit, operator console
- [x] Actions page: NL + force soft / safe-exit via agent HTTP
- [x] Audit: filters + expandable payload rows
- [x] Admin: hard limits form, members, circuit reset, notifications note
- [x] Team: roster for all roles (migration 005)
- [x] API routes: `/api/status`, `/api/actions`, `/api/audit`, `/api/admin/*`, `/api/team`
- [x] Agent `--serve` (`GET /v1/health|status`, `POST /v1/actions`)
- [x] Role-based nav + 15s dashboard polling

## Phase 8+

See `docs/Build phase.md`.
