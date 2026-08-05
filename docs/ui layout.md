Here’s a **detailed layout specification** for every page.  
This is written so a designer or coding assistant can implement the UI accurately.

---

### 1. Login Page (`/login`)

**Layout Type:** Centered single-card

```
┌─────────────────────────────────────────────────────────────┐
│    |                                                        │
│    |                                                        │
│    |               [DeFi Sentinel Logo]                     │
│    |                                                        │
│    |         Autonomous Treasury Rebalancer                 │
│    |                & Yield Sentinel                        │
│    |                                                        │
│    |    ┌─────────────────────────────────────┐             │
│    |    │                                     │             │
│    |    │     Connect your wallet to          │             │
│    |    │     continue                        │             │
│    |    │                                     │             │
│    |    │     [  Connect Wallet  ]            │             │
│    |    │                                     │             │
│    |    └─────────────────────────────────────┘             │
│    |                                                        │
│    |         Supported: Base Sepolia / Ethereum Sepolia     │
│    |                                                        │
└─────────────────────────────────────────────────────────────┘
```

**Details:**
- Full-screen dark background
- Centered glassmorphism card (max-width ~420px)
- Logo + product name above the card
- RainbowKit / ConnectKit “Connect Wallet” button
- After connection → automatic SIWE signature request
- Loading state while verifying signature
- Error message appears inside the card if signature fails or wallet is not authorized

---

### 2. Dashboard (`/dashboard`)

**Layout Type:** Main overview (most used page)

```
┌─────────────────────────────────────────────────────────────┐
│ Top Navbar: Logo | Wallet Address | Role Badge              │
├────────────┬────────────────────────────────────────────────┤
│            │  Page Title: Autonomous Treasury Rebalancer    │
│  Sidebar   │                                                │
│            │  ┌──────────────────────┐  ┌────────────────┐  │
│  Dashboard │  │                      │  │  Ask Agent     │  │
│  Actions   │  │   Health Factor      │  │                │  │
│  Audit     │  │      1.27            │  │  [text input]  │  │
│  Admin     │  │  Soft Rebalance Zone │  │                │  │
│  Team      │  │   (circular ring)    │  │ [Force Soft]   │  │
│            │  │                      │  │ [Force Exit]   │  │
│            │  └──────────────────────┘  └────────────────┘  │
│            │                                                │
│            │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│            │  │Collateral│ │   Debt   │ │Next Poll │        │
│            │  │ $5,240   │ │ $ 1,850  │ │ 4h 12m   │        │
│            │  └──────────┘ └──────────┘ └──────────┘        │
│            │                                                │
│            │  Recent Audit Trail (mini table - last 5)      │
│            │  Timestamp | Action | Tx Hash | Status         │
└────────────┴────────────────────────────────────────────────┘
```

**Key Sections:**
- **Left:** Large Health Factor display with colored circular progress (green > 1.30, amber ≤ 1.30, red ≤ 1.10)
- **Right:** “Ask Agent” natural language box + two primary action buttons (visible only to Operator/Admin)
- **Middle row:** Three metric cards
- **Bottom:** Compact recent audit trail (clickable → goes to full Audit page)

---


### 3. Audit Trail (`/audit`)

**Layout Type:** Data table + detail drawer

```
┌─────────────────────────────────────────────────────────────┐
│ Top Navbar                                                  │
├────────────┬────────────────────────────────────────────────┤
│            │  Audit Trail                                   │
│  Sidebar   │                                                │
│            │  Filters: [Date Range] [Trigger Type] [Status] │
│            │                                                │
│            │  ┌──────────────────────────────────────────┐  │
│            │  │ Timestamp      │ Trigger   │ HF  │ Action│  │
│            │  │ 2026-08-02 ... │ SCHEDULED │1.27 │ Soft  │  │
│            │  │ 2026-08-02 ... │ MANUAL    │1.15 │ Exit  │  │
│            │  │ ...            │           │     │       │  │
│            │  └──────────────────────────────────────────┘  │
│            │                                                │
│            │  (Clicking a row expands or opens a side panel)│
│            │  with full JSON payload:                       │
│            │  - Position state                              │
│            │  - Gemini thought summary                      │
│            │  - Guardrail validation                        │
│            │  - Execution details + Tx hash link            │
└────────────┴────────────────────────────────────────────────┘
```

**Details:**
- Strong filtering bar at the top
- Sortable table
- Expandable rows or right-side drawer showing the complete structured audit object
- Tx Hash is always a clickable link to Basescan / Sepolia Etherscan

---

### 5. Admin Settings (`/admin`)

**Layout Type:** Tabbed or sectioned form page

```
┌─────────────────────────────────────────────────────────────┐
│ Top Navbar                                                  │
├────────────┬────────────────────────────────────────────────┤
│            │  Admin Settings                                │
│  Sidebar   │                                                │
│            │  Tabs: [Hard Limits] [Members] [Circuit] [Notifications]
│            │                                                │
│            │  === Hard Limits Tab ===                       │
│            │  Max Repayment %        [  30  ] %             │
│            │  Max Gas Price (Gwei)   [  50  ]               │
│            │  Max Consecutive Failures [ 3 ]                │
│            │  Allowed Contracts      [list / multi-select]  │
│            │                                                │
│            │  [ Save Changes ]                              │
│            │                                                │
│            │  === Members Tab ===                           │
│            │  Wallet Address     Role        Actions        │
│            │  0x123...           Operator    [Revoke]       │
│            │  0x456...           Viewer      [Make Operator]│
│            │  [ + Add Member ]                              │
│            │                                                │
│            │  === Circuit Breaker Tab ===                   │
│            │  Status: ACTIVE / TRIPPED                      │
│            │  Failure Count: 2                              │
│            │  [ Reset Circuit Breaker ]                     │
│            │                                                │
│            │  === Notifications Tab ===                     │
│            │  Discord Webhook URL  [................]       │
│            │  [ Save ]                                      │
└────────────┴────────────────────────────────────────────────┘
```

**Details:**
- Clear tabs or vertical sections
- Forms with validation
- Members table with role change and revoke actions
- Dangerous actions (Reset Circuit Breaker) require confirmation

---

### 6. Team Page (`/team`)

**Layout Type:** Simple read-only table

```
┌─────────────────────────────────────────────────────────────┐
│ Top Navbar                                                  │
├────────────┬────────────────────────────────────────────────┤
│            │  Team                                          │
│  Sidebar   │                                                │
│            │  Organization Members                          │
│            │                                                │
│            │  Wallet               Role       Joined        │
│            │  0xAdmin...           Admin      2026-07-12    │
│            │  0xOperator1...       Operator   2026-07-15    │
│            │  0xViewer...          Viewer     2026-07-20    │
│            │                                                │
│            │  (No edit actions – read only)                 │
└────────────┴────────────────────────────────────────────────┘
```

**Details:**
- Very lightweight
- Only shows wallet (truncated), role, and join date
- Visible to all authenticated users for transparency

---

