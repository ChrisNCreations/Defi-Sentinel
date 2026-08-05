Here is the complete **Development.md** — copy everything below:

```markdown
# Development.md
## Local Development & Contribution Guide
### Autonomous Treasury Rebalancer & Yield Sentinel (Testnet Phase)

This document tells a developer (or coding assistant) exactly how to set up, run, test, and extend the project.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | LTS recommended |
| pnpm | ≥ 9 | Preferred package manager |
| Git | latest | — |
| Supabase CLI | latest | `npm i -g supabase` |
| Docker | latest | Required by Supabase local |
| Foundry (optional) | latest | Only if you need local contract helpers |

Also required:
- A free [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- A KeeperHub account + organization API key
- WalletConnect Project ID (for RainbowKit)
- Testnet ETH + test USDC on Base Sepolia / Ethereum Sepolia (faucets)

---

## 2. First-Time Setup

```bash
# 1. Clone
git clone <repo-url> defi-sentinel
cd defi-sentinel

# 2. Install dependencies
pnpm install

# 3. Start local Supabase
supabase start
# Copy the API URL and anon/service-role keys that are printed

# 4. Environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/agent/.env.example apps/agent/.env

# Fill in the values (see section 3)

# 5. Run database migrations
supabase db reset   # applies all migrations in supabase/migrations

# 6. Seed an Admin + Operator (optional helper script)
pnpm --filter agent seed-roles
```

---

## 3. Environment Variables

### `apps/web/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_wc_project_id
```

### `apps/agent/.env`
```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # service role — agent only

GEMINI_API_KEY=your_gemini_key
# GEMINI_MODEL=gemini-2.0-flash

KEEPERHUB_API_KEY=kh_your_org_key
KEEPERHUB_WORKFLOW_ID=your_workflow_id
# rest (default) | mcp
KEEPERHUB_TRANSPORT=rest
# KEEPERHUB_MCP_URL=https://app.keeperhub.com/mcp
# KEEPERHUB_MCP_FALLBACK_REST=1
# KEEPERHUB_DRY_RUN=0

AAVE_POOL_ADDRESS_BASE_SEPOLIA=0x...
AAVE_POOL_ADDRESS_ETH_SEPOLIA=0x...
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org
RPC_URL_ETH_SEPOLIA=https://rpc.sepolia.org

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
HARD_GAS_CAP_GWEI=50
```

**Never commit real keys.** Use `.env.example` files that contain only placeholders.  
**Supabase URL** must be the project origin only (no `/rest/v1/` suffix).

---

## 4. Running the Project

### Start everything in development mode

```bash
# Terminal 1 – Supabase (if not already running)
supabase start

# Terminal 2 – Next.js frontend
pnpm --filter web dev
# → http://localhost:3000

# Terminal 3 – Agent daemon
pnpm --filter agent dev
```

### Useful individual commands

```bash
# Type-check whole monorepo
pnpm type-check

# Lint
pnpm lint

# Run agent once (formula + guardrail self-check)
pnpm --filter agent once

# Health check: env, REST, optional MCP, RPC
pnpm --filter agent agent-doctor

# List org workflows (not marketplace)
pnpm --filter agent list-workflows

# Force Soft Rebalance (Operator wallet in organization_members)
pnpm --filter agent force-soft -- --actor 0xYourOperatorAddress --mock-hf 1.2

# Same path via optional MCP transport
pnpm --filter agent force-soft -- --actor 0x… --mock-hf 1.2 --transport mcp

# Natural language (Gemini → formula → guardrails → KeeperHub)
pnpm --filter agent chat -- --actor 0x… --message "repay 20% if needed" --mock-hf 1.15

# Optional system KeeperHub CLI (install separately)
pnpm --filter agent kh -- workflow list
```

### How the agent talks to KeeperHub

Product path (unchanged by transport):

1. Formula (and optional Gemini) decides action  
2. Guardrails (role, circuit, hard limits, close factor)  
3. Execute **pinned** workflow `KEEPERHUB_WORKFLOW_ID` via REST (default) or MCP  
4. Write Supabase `audit_logs`

Ops helpers (`agent-doctor`, `list-workflows`, `kh`) do **not** replace that path.  
See [keeperhub-integration.md](./keeperhub-integration.md).

---

## 5. Database Workflow

```bash
# Create a new migration
supabase migration new descriptive_name

# Apply migrations
supabase db reset          # wipes local DB and re-applies all
# or
supabase db push           # pushes to linked remote (careful)

# Generate TypeScript types from schema
supabase gen types typescript --local > packages/shared/src/database.types.ts
```

**Rule:** All schema changes go through migrations. Never edit the local database manually and expect it to stay in sync.

---

## 6. Adding a New Operator

1. Admin logs into the UI → `/admin`
2. Adds the wallet address and selects role `operator`
3. (Optional but recommended) Add the same wallet as a member in the KeeperHub organization dashboard
4. The new Operator can immediately log in with SIWE and use `/actions`

Revocation is the reverse: remove or change the role in `/admin`. The change is effective on the next request.

---

## 7. Testing Strategy

### Unit Tests (Agent)
- Formula engine (`decideAction`)
- Role validator
- Hard-limits checker
- Circuit breaker state machine

```bash
pnpm --filter agent test
```

### Integration Tests
- Full Soft Rebalance path against Base Sepolia (requires faucet funds)
- Guardrail rejection paths (wrong role, circuit tripped, limit exceeded)

### Manual Checklist (before merging)
- [ ] Viewer cannot see Audit or Actions pages
- [ ] Operator can force Soft Rebalance and see the tx on Basescan
- [ ] Admin can change `max_repayment_pct` and the agent respects the new value
- [ ] Circuit breaker trips after 3 consecutive failures and blocks further runs
- [ ] Audit log entry is written for both success and rejection cases
- [ ] Gemini thought summary appears in the audit record

---

## 8. Code Style & Architecture Rules (Enforced)

1. **API routes contain no UI logic**
2. **React components contain no DB or agent logic**
3. **Agent code never imports from `@/components` or `@/app`**
4. All execution paths must pass the deterministic guardrail middleware
5. Hard limits cannot be overridden by Gemini or Operators
6. `audit_logs` is append-only
7. Prefer pure functions for formula and validation logic
8. Use shared types from `packages/shared` – do not duplicate interfaces

A coding assistant must respect these rules when generating new code.

---

## 9. Common Development Tasks

### Change the Soft Rebalance percentage
Edit the constant in `apps/agent/src/formula/health-factor.ts` **and** update the default in the `hard_limits` table migration if needed.

### Add a new hard limit
1. Add column to `hard_limits` via migration
2. Update `guardrails/hard-limits.ts`
3. Update Admin UI form
4. Update audit payload type

### Switch network (Base ↔ Ethereum Sepolia)
Change the RPC URL and Aave Pool address in the agent `.env`. The frontend chain list is controlled by the wagmi config.

### Debug a failed KeeperHub execution
1. Look at the latest `audit_logs` row
2. Check `execution_details.simulation_status` and `retry_attempts`
3. Run `pnpm --filter agent agent-doctor` and `list-workflows`
4. Verify `KEEPERHUB_WORKFLOW_ID` and org API key
5. Confirm the workflow has real Aave write steps (not only a Manual trigger)
6. Confirm Turnkey wallet is funded and policy allows required contracts

### Roles (SIWE)
- **Admin / Operator**: explicit rows in `organization_members` (seed or admin-managed)
- **Viewer**: any other wallet — auto-enrolled as public viewer on login (dashboard only)

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| SIWE login fails | Wrong WalletConnect project ID or Supabase keys | Double-check `.env.local`; URL must not end with `/rest/v1/` |
| Agent says `ROLE_INSUFFICIENT` | Actor not admin/operator | Seed or promote wallet; viewers cannot execute |
| KH execute succeeds, no `tx_hash` | Workflow has no on-chain write steps | Add Aave repay nodes in KeeperHub builder |
| MCP fails | Transport/protocol or tool names | Use `--transport rest` or `KEEPERHUB_MCP_FALLBACK_REST=1` |
| `pnpm doctor` does something else | Conflicts with pnpm’s own doctor | Use `pnpm --filter agent agent-doctor` |
| `kh` not found | Optional CLI not installed | Install from KeeperHub releases; not required for product |
| Circuit breaker stuck | Previous failures | Admin resets on `/admin` |
| Gemini fallback / 429 | Quota or model | Set `GEMINI_MODEL`; heuristics still resolve common intents |
| Supabase types out of date | Schema changed | Re-run `supabase gen types` |

---

## 11. Deployment Notes (Testnet)

- Frontend: Vercel or any Node host (set environment variables)
- Agent: Fly.io, Railway, or a simple VPS with PM2 / systemd
- Supabase: Use the hosted free tier for testnet (or keep local for pure development)
- Never expose the service-role key to the browser or to Vercel environment variables that are public

---

## 12. Getting Help

1. Check this file + Architecture.md + System-Overview.md
2. Look at the latest audit log entry – it usually contains the exact rejection reason
3. Ask the team with the `execution_id` from the audit log

---

**Document Status**  
Living document. Update whenever setup steps, scripts, or common workflows change.
```
