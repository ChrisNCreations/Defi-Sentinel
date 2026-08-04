# DeFi Sentinel

**Autonomous Treasury Rebalancer & Yield Sentinel** — gas-optimized, non-custodial agent for Aave V3 positions on Base Sepolia and Ethereum Sepolia.

Design and architecture live in [`docs/`](./docs/). This monorepo is the implementation.

## Monorepo layout

```
apps/web          Next.js 15 App Router (Vercel deploy target)
apps/agent        Node/TS daemon (Fly / Railway / VPS — not Vercel)
packages/shared   Shared types & constants
supabase/         Migrations + local config
keeperhub/        Workflow schemas / docs
docs/             Product, architecture, design, build plan
```

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| Supabase CLI + Docker | Phase 1+ |
| WalletConnect Project ID | Phase 1 |
| Gemini / KeeperHub keys | Later phases |

## Quick start

```bash
pnpm install

# Next.js UI → http://localhost:3000
pnpm dev
# or
pnpm --filter web dev

# Agent daemon (idle until Ctrl+C)
pnpm --filter agent dev

# Formula self-check (no wallet / no RPC)
pnpm --filter agent once

# Decide action for a testnet wallet (reads Aave V3 on-chain)
pnpm --filter agent decide -- --wallet 0xYourAddress --network base-sepolia

# Decide from a mock health factor (offline / unit demos)
pnpm --filter agent decide -- --mock-hf 1.15
```

Copy env templates (do not commit real secrets):

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/agent/.env.example apps/agent/.env
```

### Phase 1 — Auth & DB

```bash
# Requires Docker + Supabase CLI
supabase start
supabase db reset   # applies migrations 001–004 + seed wallets

# Copy URL / anon / service_role keys from `supabase start` into:
#   apps/web/.env.local  (NEXT_PUBLIC_* + SUPABASE_SERVICE_ROLE_KEY + AUTH_SECRET)
#   apps/agent/.env      (SUPABASE_* for later phases)

pnpm --filter agent seed-roles   # print seeded Admin / Operator / Viewer addresses
pnpm dev                         # open /login → connect seed wallet → SIWE
```

| Role | Seed wallet (Anvil) |
|------|---------------------|
| Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Operator | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Viewer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

Viewers can open `/dashboard` but are denied `/audit` (middleware + RLS).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web app |
| `pnpm dev:agent` | Start agent process |
| `pnpm --filter agent decide -- --wallet 0x…` | Read Aave position + print formula decision |
| `pnpm --filter agent force-soft -- --actor 0x…` | Guardrails + KeeperHub execute (Turnkey remote) |
| `pnpm --filter agent force-soft -- --actor 0x… --dry-run-keeper` | Guardrails + payload only (no KH call) |
| `pnpm --filter agent guard -- --actor 0x… --mock-hf 1.15` | Formula + guardrails (dry-run audit without DB keys) |
| `pnpm --filter agent test` | Agent unit tests (formula + guardrails) |
| `pnpm build` | Build all packages that define `build` |
| `pnpm lint` | Lint workspaces |
| `pnpm type-check` | TypeScript check across workspaces |

## Deployment (testnet)

| Component | Host | Env notes |
|-----------|------|-----------|
| `apps/web` | **Vercel** | `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` only |
| `apps/agent` | Fly.io / Railway / VPS | Service role, Gemini, KeeperHub, RPC — never public |
| Supabase | Hosted free tier | Auth + RLS + audit |

**Never** put `SUPABASE_SERVICE_ROLE_KEY` in the browser or public Vercel env.

Vercel project settings when ready:

- Root Directory: `apps/web` (or monorepo install from repo root with filter)
- Framework: Next.js
- Install: `pnpm install` (from monorepo root if needed)

## Architecture rules

1. API routes contain no UI logic  
2. React components contain no DB or agent logic  
3. Agent never imports from `@/components` or web app modules  
4. All execution paths pass deterministic guardrails  
5. Hard limits cannot be overridden by Gemini or Operators  
6. `audit_logs` is append-only  

## Docs

- [Project overview](./docs/Project_overview.md)
- [Architecture](./docs/architecture)
- [Build phases](./docs/Build%20phase.md)
- [Development](./docs/Development.md)
- [Library usage](./docs/library-docs.md)
- [Design system](./docs/design.md)
- [UI layouts](./docs/ui%20layout.md)

## Current phase

**Phase 0 — complete** (monorepo, shadcn/ui, design tokens).  
**Phase 1 — complete** (schema, RLS, SIWE, protected routes, seed roles).  
**Phase 2 — complete** (Aave reader + deterministic HF formula + decide CLI).  
**Phase 3 — complete** (guardrails pipeline, circuit breaker, audit writer skeleton).  
**Phase 4 — complete** (KeeperHub REST execute + poll + audit; Turnkey never in-process).

**Next: Phase 5** — Gemini brain (gas estimate + NL intent).
