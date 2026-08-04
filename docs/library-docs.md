# library-docs.md
## How We Use External Libraries
### Autonomous Treasury Rebalancer & Yield Sentinel (Testnet Phase)

This document explains **exactly** how each major library is used in the project, including configuration patterns, important gotchas, and the specific APIs we rely on.  
A coding assistant should follow these patterns so the codebase stays consistent.

---

## 1. Next.js 15 (App Router)

**Used for:** Frontend + thin API routes

### Key Conventions
- All pages live under `app/` using the App Router.
- Route groups: `(auth)` and `(protected)`.
- API routes are **thin**: authenticate → validate role → call agent or Supabase → return JSON.  
  **No UI logic, no business logic.**

### Important Files
```ts
// app/api/agent/force-rebalance/route.ts (example pattern)
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const session = await getSessionAndRole()
  if (!session || !['operator', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'ROLE_INSUFFICIENT' }, { status: 403 })
  }

  // Forward to agent or call shared logic
  // ...
}
```

### Gotchas
- Use `cookies()` from `next/headers` only inside Server Components or Route Handlers.
- Never import agent code into the Next.js app.

---

## 2. Supabase (Auth + Database + RLS)

**Packages:**
- `@supabase/supabase-js`
- `@supabase/ssr` (for Next.js App Router)

### Client Creation Pattern

```ts
// lib/supabase/client.ts (browser)
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// lib/supabase/server.ts (server)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

### SIWE / Wallet Auth
We use Supabase’s native Web3 support (or a custom SIWE flow with wagmi).  
After the user signs the message, Supabase issues a JWT.  
The JWT is the only credential the frontend ever holds.

### Service Role (Agent only)
The agent uses the **service role key** with these restrictions:
- Can `INSERT` into `audit_logs`
- Can `SELECT` from `organization_members` and `hard_limits`
- **Cannot** `UPDATE` or `DELETE` from `audit_logs` (enforced by missing policies + explicit grants)

```ts
// apps/agent – only place service role is used
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```

### RLS Rules We Rely On
- Viewers can only read their own membership and basic position data.
- Operators & Admins can read `audit_logs`.
- Only Admins can modify `organization_members` and `hard_limits`.
- `audit_logs` has **no UPDATE/DELETE policies**.

---

## 3. wagmi + RainbowKit (or ConnectKit)

**Used for:** Wallet connection and SIWE message signing.

### Typical Setup
```ts
// lib/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia, sepolia } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'DeFi Sentinel',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [baseSepolia, sepolia],
  ssr: true,
})
```

### SIWE Flow
1. User connects wallet.
2. Frontend requests a nonce from Supabase (or our API).
3. User signs the SIWE message.
4. Signature is sent to Supabase Auth → JWT issued.
5. JWT is stored in cookies via `@supabase/ssr`.

**Gotcha:** Always use the same chain list in both wagmi config and the agent’s RPC URLs.

---

## 4. Google Gemini 2.5 Flash

**Package:** `@google/generative-ai`

### Usage Scope (strict)
Gemini is used **only** for:
- Gas / priority-fee estimation
- Natural-language intent parsing
- Generating short human-readable `thought_summary`

It is **never** allowed to decide repay amounts or override hard limits.

### Client Pattern
```ts
// apps/agent/src/brain/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

export async function getGasEstimate(network: string): Promise<number> {
  const prompt = `...` // structured prompt
  const result = await model.generateContent(prompt)
  // parse and return number
}

export async function interpretOperatorIntent(text: string, context: PositionState) {
  // returns structured intent or null
}
```

### Important Rules
- Always treat the model output as untrusted.
- Run deterministic guardrails **after** Gemini.
- Store only the short `thought_summary` + proposed tool call in the audit log (never the full conversation).

---

## 5. viem (or ethers) – On-chain Reads

**Preferred:** `viem` (lighter and TypeScript-first)

### Aave V3 Reader Example
```ts
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL_BASE_SEPOLIA),
})

const AAVE_POOL_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
])

export async function getUserAccountData(user: `0x${string}`) {
  return client.readContract({
    address: process.env.AAVE_POOL_ADDRESS_BASE_SEPOLIA as `0x${string}`,
    abi: AAVE_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [user],
  })
}
```

**Gotcha:** Health factor is returned with 18 decimals. Always divide by `1e18` before comparing to 1.30 / 1.10.

---

## 6. KeeperHub Client

**Integration method:** HTTP / MCP (Model Context Protocol) as provided by KeeperHub.

### Responsibilities of our client
- Authenticate with the organization API key
- Submit workflow payloads
- Poll or receive status (tx hash, simulation result, final status)
- Surface errors cleanly to the agent

```ts
// apps/agent/src/keeperhub/client.ts (illustrative)
export async function executeWorkflow(payload: WorkflowPayload) {
  const res = await fetch(`${KEEPERHUB_API}/workflows/${WORKFLOW_ID}/execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  // handle response, retries, etc.
}
```

**Critical:** The agent never constructs raw signed transactions. KeeperHub + Turnkey handle signing under the workflow policy.

---

## 7. node-cron (or setInterval) – Poller

**Used in:** `apps/agent/src/poller/scheduler.ts`

```ts
import cron from 'node-cron'

// Every 6 hours
cron.schedule('0 */6 * * *', async () => {
  await runScheduledCycle()
})
```

Alternative (simpler):
```ts
setInterval(runScheduledCycle, 6 * 60 * 60 * 1000)
```

**Gotcha:** Make sure the process stays alive (use a process manager or keep the event loop active).

---

## 8. Tailwind CSS + shadcn/ui

**Used for:** All UI components.

### Conventions
- Use shadcn/ui components exclusively for buttons, cards, tables, dialogs, etc.
- No custom CSS files unless absolutely necessary.
- Dark mode support is optional for the testnet phase.

### Example
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
```

---

## 9. Shared Package (`packages/shared`)

Contains only:
- TypeScript types (`Role`, `Action`, `PositionState`, `AuditLogPayload`, …)
- Constants (HF thresholds, default hard limits, etc.)
- Pure utility functions that both apps need

**Never** put runtime side-effects or environment-specific code here.

---

## 10. Environment Variables Summary

### Next.js (`apps/web`)
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

### Agent (`apps/agent`)
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
KEEPERHUB_API_KEY=
KEEPERHUB_WORKFLOW_ID=
AAVE_POOL_ADDRESS_BASE_SEPOLIA=
AAVE_POOL_ADDRESS_ETH_SEPOLIA=
RPC_URL_BASE_SEPOLIA=
RPC_URL_ETH_SEPOLIA=
DISCORD_WEBHOOK_URL=
HARD_GAS_CAP_GWEI=50
```

---

## Quick Reference – What Each Library Is Allowed to Do

| Library              | Allowed                                      | Forbidden                          |
|----------------------|----------------------------------------------|------------------------------------|
| Next.js API routes   | Auth, role check, forward to agent           | Business logic, UI rendering       |
| Supabase client      | Auth, RLS-protected queries                  | Service role in browser            |
| Gemini               | Gas estimate, NL parse, short summary        | Decide amounts, override limits    |
| viem                 | Read `getUserAccountData`                    | Send transactions                  |
| KeeperHub client     | Submit workflow, receive status              | Hold private keys                  |
| Agent code           | Everything above + formula + guardrails      | Import from `@/components`         |

---

**Document Status**  
Living document. Update when a new library is introduced or a usage pattern changes.
```

