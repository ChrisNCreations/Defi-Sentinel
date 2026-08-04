# System Overview
## Autonomous Treasury Rebalancer & Yield Sentinel

---

### 1. What the Product Is

The **Autonomous Treasury Rebalancer & Yield Sentinel** (also referred to as **DeFi Sentinel**) is a gas-optimized, non-custodial autonomous agent that monitors and protects Aave V3 collateral positions on EVM testnets (Base Sepolia and Ethereum Sepolia).

It acts as a continuous safety co-pilot for a single Turnkey-managed MPC wallet. The agent:

- Periodically reads on-chain health factor data
- Applies deterministic risk rules
- Executes repay or full-exit transactions through KeeperHub workflows
- Records every decision and on-chain outcome in an immutable audit trail

The system never holds private keys. All signing is performed by Turnkey MPC wallets under policies controlled by KeeperHub workflows. Operators interact with the agent through natural language; the agent never exposes raw keys or allows unrestricted execution.

---

### 2. Who It Is For

| Audience | Primary Need |
|----------|--------------|
| **Small Treasury Teams & DAOs** | Shared operational wallets with strict risk thresholds and role-based delegation |
| **DeFi Power Users** | Automated position maintenance without ever exposing private keys |
| **AI Agent Developers** | A working reference implementation that combines Gemini reasoning, Supabase auth/RLS, and KeeperHub non-custodial execution |

---

### 3. What the Product Is All About

DeFi positions require constant vigilance. A sudden drop in collateral value or spike in debt can push a position below safe health-factor levels within minutes. Manual monitoring is exhausting; most existing bots either:

- Run rigid scripts that cannot adapt, or
- Require users to hand over private keys or full custody

This product solves both problems by combining:

1. **Deterministic safety rules** (pure formula) for the actual rebalance amounts
2. **Gemini 2.5 Flash** for gas/slippage estimation, natural-language understanding, and human-readable audit explanations
3. **KeeperHub + Turnkey MPC** for secure, policy-constrained execution
4. **Supabase** (SIWE + Row-Level Security) for authentication, role enforcement, and an append-only audit log

The result is an autonomous agent that can keep a position healthy on a 6-hour schedule while still allowing privileged Operators to intervene via natural language when needed.

---

### 4. Problem Statement

Managing Aave V3 positions manually creates three persistent risks:

1. **Liquidation risk** – Health factor can deteriorate faster than a human can react.
2. **Key exposure risk** – Most automation solutions require private keys or full wallet custody.
3. **Cost & complexity risk** – Continuous event listening burns API quotas; rigid bots cannot reason about gas, slippage, or operator intent.

Existing solutions either sacrifice security (key exposure) or intelligence (static scripts). The Sentinel addresses all three by keeping keys inside Turnkey, enforcing hard limits at both protocol and agent layers, and using Gemini only for the parts that benefit from language understanding and estimation.

---

### 5. Core Product Functionalities

| Functionality | Description |
|---------------|-------------|
| **Web3 Native Auth (SIWE)** | Users sign in with their wallet. Supabase issues a JWT and enforces RLS. |
| **Role-Based Access** | Admin configures KeeperHub workflows & hard limits. Operators (selected members of a KeeperHub organization) can trigger manual actions and view full audit logs. Viewers see only vault status. |
| **Position Health Monitoring** | Every 6 hours the agent calls `AavePool.getUserAccountData()` and evaluates the health factor. |
| **Deterministic Rebalancing Rules** | HF > 1.30 → do nothing<br>HF ≤ 1.30 → Soft Rebalance (repay ~20 % of debt)<br>HF ≤ 1.10 → Safe-Exit (repay full debt + withdraw collateral to stablecoins) |
| **Operator Natural-Language Control** | Privileged Operators can instruct the agent in plain English to check status or force a rebalance (still subject to hard limits and Aave close-factor rules). |
| **Gas & Slippage Estimation** | Gemini estimates priority fees and applies a 10–20 % buffer. KeeperHub performs `eth_estimateGas` simulation and automatic fee-bump retries. |
| **Hard Safety Limits** | Configurable caps (max repayment %, max gas price, allowed contracts, etc.) that neither the scheduled agent nor an Operator-forced action can override. |
| **Circuit Breaker** | After 3 consecutive failures the agent stops and alerts Operators. |
| **Visual Audit Trail** | Every cycle (scheduled or manual) writes a structured, append-only record containing position state, Gemini reasoning summary, guardrail validation, simulation result, tx hash, and final status. |
| **Emergency Self-Repay** | If the position is already liquidatable when the agent wakes, it attempts an emergency repay respecting Aave’s 50 % close factor. |

**Out of current scope (planned or deferred)**
- x402 / MPP micro-payment gating (may be dropped for cost reasons)
- Multi-protocol support beyond Aave V3
- Mainnet capital (strictly testnet for now)

---

### 6. Application Pages & Full User Flows

The frontend is a Next.js 15 App Router application protected by Supabase Auth (SIWE).

#### 6.1 Login Page (`/login`)

**Purpose**  
Authenticate the user via Sign-In with Ethereum (SIWE).

**User Flow**
1. User connects wallet (RainbowKit / wagmi).
2. User signs the SIWE message.
3. Frontend exchanges the signature for a Supabase JWT.
4. Supabase RLS evaluates the user’s role (`admin`, `operator`, `viewer`).
5. User is redirected according to role:
   - Admin → `/admin`
   - Operator → `/dashboard`
   - Viewer → `/dashboard` (read-only)

**Edge cases**
- Invalid signature → clear error, stay on login.
- Wallet not in any organization → “Access denied” message.

---

#### 6.2 Dashboard / Vault Status (`/dashboard`)

**Purpose**  
Single-pane view of the current Aave V3 position and agent status. Visible to all authenticated roles (with different action buttons).

**Displayed Data**
- Current Health Factor (color-coded)
- Collateral USD value & debt USD value
- Last successful cycle timestamp
- Circuit-breaker status
- Next scheduled poll time
- Quick links to Audit Trail and (if Operator) Manual Actions

**User Flows**

| Role | Available Actions |
|------|-------------------|
| Viewer | View only |
| Operator | “Ask Agent” natural-language input + “Force Soft Rebalance” / “Force Safe-Exit” buttons |
| Admin | Same as Operator + link to Admin settings |

**Operator Natural-Language Flow**
1. Operator types instruction (e.g. “Check health factor and repay 20 % if needed”).
2. Frontend sends message to agent API route.
3. Agent (Gemini) interprets intent, runs formula + guardrails.
4. Result + human-readable explanation returned to UI and written to audit log.

---

#### 6.3 Audit Trail (`/audit`)

**Purpose**  
Searchable, immutable history of every agent cycle.

**Visible to**  
Operators and Admins only.

**Displayed Columns**
- Timestamp
- Trigger type (`SCHEDULED_CRON` | `MANUAL_OPERATOR`)
- Health Factor at decision time
- Proposed action & amount
- Guardrail validation result
- Transaction hash (link to Basescan / Sepolia Etherscan)
- Final status (`CONFIRMED` | `REVERTED` | `CIRCUIT_BREAKER_HALT` | …)

**User Flow**
1. User opens `/audit`.
2. Optional filters: date range, trigger type, status.
3. Click any row → expand full structured payload (position state, Gemini thought summary, gas details, etc.).
4. Auditor can reconstruct the complete decision chain from the stored record alone.

**Retention**  
2 weeks (append-only Supabase table).

---

#### 6.4 Manual Actions / Operator Console (`/actions`)

**Purpose**  
Dedicated interface for Operators to issue natural-language commands or one-click force actions.

**User Flow**
1. Operator opens `/actions`.
2. Chooses either:
   - Free-text instruction box, or
   - One-click buttons (“Force Soft Rebalance”, “Force Safe-Exit”, “Emergency Self-Repay”).
3. Frontend calls protected API route.
4. Agent middleware:
   - Validates role
   - Runs pure-formula check (or respects Operator override flag)
   - Applies hard limits
   - Calls Gemini for gas/slippage + human explanation
   - Submits payload to KeeperHub workflow
5. Real-time status updates appear in the UI (simulation → broadcast → confirmed/reverted).
6. Full record written to audit log.

**Safety**  
Even Operator-forced actions cannot exceed hard limits or Aave close-factor rules. Violations are rejected with a clear error message.

---

#### 6.5 Admin Settings (`/admin`)

**Purpose**  
Configure KeeperHub workflows, hard limits, and organization membership.

**Visible to**  
Admin role only.

**Sections**
- **Workflow Configuration** – select / update the KeeperHub workflow ID that the agent uses.
- **Hard Limits** – max repayment percentage, max gas price (Gwei), allowed contracts, max consecutive failures, etc.
- **Organization Members** – view / revoke Operators (synced with KeeperHub organization API key members).
- **Circuit Breaker** – manually reset or force-trip.
- **Notification Channels** – Discord webhook URL for emergency alerts.

**User Flow**
1. Admin updates a hard limit or revokes an Operator.
2. Change is written to Supabase and (where possible) pushed to KeeperHub.
3. Revocation takes effect for new actions immediately; in-flight transactions continue to completion.
4. All configuration changes themselves are logged in the audit trail.

---

#### 6.6 Team / Roles Overview (`/team`) (optional lightweight page)

**Purpose**  
Simple read-only list of current Admins, Operators, and Viewers for transparency.

**Visible to**  
All authenticated users.

---

### 7. High-Level System Boundaries (for reference)
┌─────────────────┐     SIWE + JWT      ┌──────────────────┐
│  Next.js App    │ ◄──────────────────► │    Supabase      │
│  (UI + API)     │                      │  Auth + RLS +    │
└────────┬────────┘                      │  Audit Logs      │
│                                        └──────────────────┘
│ protected API routes
▼
┌─────────────────┐     MCP / HTTP      ┌──────────────────┐
│  Agent Daemon   │ ◄──────────────────► │   KeeperHub      │
│  (Node/TS)      │                      │  Workflows +     │
│  - Gemini brain │                      │  Turnkey MPC     │
│  - Formula eng. │                      └────────┬─────────┘
│  - Guardrails   │                               │
└─────────────────┘                               ▼
┌──────────────────┐
│  Aave V3 Pool    │
│  (Base/Eth Sepolia)│
└──────────────────┘


---

### 8. Non-Negotiable Agent Rules (will be expanded in Architecture.md)

- API routes contain **no UI logic**.
- React components contain **no database or agent logic**.
- Agent code **never** imports from frontend components or server actions.
- All execution paths (scheduled or manual) must pass deterministic guardrail validation before reaching KeeperHub.
- Hard limits configured by Admin cannot be overridden by Gemini or by Operators.
- Audit records are append-only; no update or delete from application keys.

---

**Document Status**  
This System Overview reflects the testnet-phase design as of the latest clarification round. Mainnet transition requirements will be documented separately when the team is ready.