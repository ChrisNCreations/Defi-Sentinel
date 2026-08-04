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

## Phase 5+

See `docs/Build phase.md`.
