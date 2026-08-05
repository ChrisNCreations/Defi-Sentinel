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


Viewers can open `/dashboard` but are denied `/audit` and `/actions` (middleware + RLS).  
Admin / Operator are never auto-assigned; only seed or explicit membership grants those roles.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web app |
| `pnpm dev:agent` | Start agent process |
| `pnpm --filter agent decide -- --wallet 0x…` | Read Aave position + print formula decision |
| `pnpm --filter agent force-soft -- --actor 0x…` | Guardrails + KeeperHub execute (Turnkey remote) |
| `pnpm --filter agent force-soft -- --actor 0x… --dry-run-keeper` | Guardrails + payload only (no KH call) |
| `pnpm --filter agent chat -- --actor 0x… --message "repay 20% if needed" --mock-hf 1.15` | NL via Gemini → formula/guardrails/KeeperHub |
| `pnpm --filter agent force-soft -- … --transport mcp` | Same path, KeeperHub via MCP (optional) |
| `pnpm --filter agent agent-doctor` | Env + REST (+ MCP if enabled) health check |
| `pnpm --filter agent list-workflows` | List **org** workflows (no marketplace) |
| `pnpm --filter agent kh -- workflow list` | Optional system `kh` CLI wrapper |
| `pnpm --filter agent guard -- --actor 0x… --mock-hf 1.15` | Formula + guardrails (dry-run audit without DB keys) |
| `pnpm --filter agent test` | Agent unit tests (formula + guardrails) |
| `pnpm build` | Build all packages that define `build` |
| `pnpm lint` | Lint workspaces |
| `pnpm type-check` | TypeScript check across workspaces |

## Deployment (testnet)


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


