# KeeperHub Integration (DeFi Sentinel)

How the product agent uses KeeperHub, what it does **not** use, and how that relates to [KeeperHub AI tools / MCP docs](https://docs.keeperhub.com/ai-tools/mcp-server).

---

## Product path (does not change with transport)

```
CLI / future API
  → Aave read (or --mock-hf)
  → Formula (HF → NONE | SOFT_REBALANCE 20% | SAFE_EXIT)
  → Gemini brain (optional; intent + gas + summary — untrusted)
  → Guardrails (role, circuit, hard limits, close factor)
  → KeeperHub execute (REST default or MCP)
  → Supabase audit_logs (+ circuit update)
```

Amounts and whether to act come from **our** formula and guardrails.  
KeeperHub is the **execution + Turnkey** layer for a **pinned** org workflow.

---

## Surfaces

| Surface | Used? | Role |
|---------|-------|------|
| REST `POST /api/workflows/{id}/execute` + executions list | **Yes (default)** | Product execute/poll |
| MCP `https://app.keeperhub.com/mcp` — `execute_workflow`, `get_execution` | **Optional** | Same execute/poll over MCP |
| Org workflow list (REST) | Ops | `pnpm --filter agent list-workflows` |
| External `kh` CLI | Ops optional | `pnpm --filter agent kh -- …` |
| KeeperHub visual builder | Human | Design Aave repay steps; set `KEEPERHUB_WORKFLOW_ID` |
| Turnkey org wallet | Platform | Signs when workflow has write steps |
| MCP `create_workflow` / `update_workflow` / `delete_workflow` | **No (product)** | See below |
| Marketplace `call_workflow`, x402, MPP, agentic wallet | **No** | Explicit non-goal |

---

## REST vs MCP vs Claude MCP connect

| Audience | How they connect |
|----------|------------------|
| **DeFi Sentinel agent** (`apps/agent`) | REST by default; optional MCP client **inside** the daemon for execute only |
| **Human / Claude Code** following KeeperHub docs | `claude mcp add … https://app.keeperhub.com/mcp` — separate from our product; useful for building/debugging workflows |

Both use the same org API key style (`kh_…`). Our product does **not** need Claude MCP for Soft Rebalance to work.

### Env

```env
KEEPERHUB_API_KEY=kh_…
KEEPERHUB_WORKFLOW_ID=…
KEEPERHUB_TRANSPORT=rest          # or mcp
# KEEPERHUB_MCP_URL=https://app.keeperhub.com/mcp
# KEEPERHUB_MCP_FALLBACK_REST=1
```

### Commands

```bash
pnpm --filter agent agent-doctor
pnpm --filter agent list-workflows
pnpm --filter agent force-soft -- --actor 0x… --mock-hf 1.2 --transport rest
pnpm --filter agent force-soft -- --actor 0x… --mock-hf 1.2 --transport mcp
pnpm --filter agent kh -- workflow list   # if `kh` installed
```

---

## On-chain execution reality

The agent **can** trigger KeeperHub. A **Basescan tx** only appears if:

1. The pinned workflow has real write steps (e.g. Aave V3 repay), and  
2. The org Turnkey wallet is funded for gas on that chain.

A workflow that is only a Manual trigger may return **success** without `tx_hash` — that is expected until write nodes are added. Blueprint notes: `keeperhub/workflows/aave-rebalance.json`.

---

## Would `create_workflow` / `update_workflow` change the product?

| Wiring | Product change? |
|--------|-----------------|
| Not implemented (current) | No |
| Ops-only CLI, never on Soft Rebalance path | Capability only; **behavior** of force-soft/chat/poller unchanged if still env-pinned workflow |
| Agent creates/updates workflows automatically during runs | **Yes** — product no longer “fixed reviewed workflow”; harder safety review |

**Policy for this repo:** do **not** call create/update/delete from formula/chat/guardrails/execute path. Workflow graphs are reviewed in KeeperHub UI (or separate ops process), then referenced by `KEEPERHUB_WORKFLOW_ID`.

If create/update is ever added, treat as **gated ops tooling**, not core product automation.

---

## Security rules (agent)

1. No private keys in process; scan KH responses for key material.  
2. All executes after deterministic guardrails.  
3. MCP tool allowlist only (no marketplace tools).  
4. Gemini cannot set repay % or bypass hard limits.  
5. Public SIWE wallets are viewers only; execution requires admin/operator membership.

---

## Related docs

- [Library usage – KeeperHub](./library-docs.md#6-keeperhub-client)  
- [Development](./Development.md)  
- [Architecture](./architecture)  
- Upstream: [KeeperHub MCP](https://docs.keeperhub.com/ai-tools/mcp-server), [CLI](https://docs.keeperhub.com/cli/quickstart), [Overview](https://docs.keeperhub.com/)  
