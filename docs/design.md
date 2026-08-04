Here is the complete merged **Design.md**.  
It combines the provider’s light “Sunlit cream paper, cobalt pulse” system with the exact page layouts we defined for DeFi Sentinel.

```markdown
# Design.md
## DeFi Sentinel – UI Design System & Page Layouts
**Theme:** Light – Sunlit cream paper, cobalt pulse

---

## 1. Design Philosophy

This product lives in a **sunlit, cream-warm workspace** language.

- Soft `#faf9f7` canvas replaces pure white → paper-like, approachable feel
- Typography carries the weight (large confident headlines + generous body text)
- Single electric cobalt (`#0068f9`) is the only interactive color
- Components stay featherlight: pill buttons, hairline borders, soft elevated cards, almost no heavy shadows
- The product UI itself is the visual hero

---

## 2. Design Tokens

### Colors

| Name              | Value     | Token                     | Role |
|-------------------|-----------|---------------------------|------|
| Canvas Cream      | `#faf9f7` | `--color-canvas-cream`    | Page background |
| Surface Ivory     | `#fbfaf7` | `--color-surface-ivory`   | Cards & panels |
| Pure White        | `#ffffff` | `--color-pure-white`      | Elevated surfaces, nav, button text on CTAs |
| Lavender Mist     | `#f4f0ff` | `--color-lavender-mist`   | Decorative wash / highlight |
| Powder Blue       | `#d6e4f1` | `--color-powder-blue`     | Ghost borders, subtle dividers |
| Ink Charcoal      | `#121722` | `--color-ink-charcoal`    | Primary text & headings |
| Slate Gray        | `#777c86` | `--color-slate-gray`      | Secondary text, metadata |
| Steel Gray        | `#a5a5a5` | `--color-steel-gray`      | Placeholder / disabled |
| Hairline          | `#efefef` | `--color-hairline`        | Borders & dividers |
| Electric Cobalt   | `#0068f9` | `--color-electric-cobalt` | **Primary action color** |
| Deep Cobalt       | `#024bb1` | `--color-deep-cobalt`     | Hover / pressed state |
| Vivid Violet      | `#6736eb` | `--color-vivid-violet`    | Decorative accent only |
| Forest            | `#046645` | `--color-forest`          | Success / positive status |

### Typography (Roobert / Inter substitute)

| Role          | Size | Weight | Line Height | Token |
|---------------|------|--------|-------------|-------|
| Caption       | 13px | 400/500| 1.5         | `--text-caption` |
| Body          | 16px | 400/500| 1.56        | `--text-body` |
| Subheading    | 18px | 500    | 1.5         | `--text-subheading` |
| Heading SM    | 20px | 600    | 1.38        | `--text-heading-sm` |
| Heading       | 24px | 600    | 1.33        | `--text-heading` |
| Heading LG    | 40px | 600    | 1.25        | `--text-heading-lg` |
| Display       | 57px | 600    | 1.09        | `--text-display` |
| Display LG    | 84px | 600    | 1.06        | `--text-display-lg` |

**Font stack:** `'Roobert', Inter, ui-sans-serif, system-ui, sans-serif`

### Spacing (8px base)

`8 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 88`

### Border Radius

| Element     | Value  |
|-------------|--------|
| Cards       | 16px   |
| Buttons     | 48px (pill) |
| Nav items   | 48px   |
| Icons       | 60px   |
| Badges      | 8px    |

### Shadows

- **Subtle card:** `rgba(0,0,0,0.07) 0 1px 1px, rgba(0,0,0,0.04) 0 -1px 1px inset, rgba(0,0,0,0.14) 0 0 0 0.5px inset`
- **Large soft:** `rgba(0,0,0,0.04) 0 20px 20px -8px`

---

## 3. Core Components

### Primary Button (Filled)
- Background: `#0068f9`
- Text: `#ffffff`
- Radius: 48px
- Padding: 12px 24px
- Hover → `#024bb1`

### Ghost / Neutral Button
- Background: `#ffffff`
- Text: `#121722`
- 1px border `#efefef`
- Radius: 48px

### Status Colors (Health Factor)
- Safe (> 1.30) → Forest `#046645`
- Soft Rebalance (≤ 1.30) → Electric Cobalt / Amber warning
- Danger (≤ 1.10) → Deep red (use carefully, keep system mostly calm)

---

## 4. Global App Shell (Protected Pages)

```
┌─────────────────────────────────────────────────────────────┐
│ Top Navbar (Pure White, 1px hairline bottom border)         │
│ [Logo] DeFi Sentinel          [0x742...D9F8]  [Operator]    │
├────────────┬────────────────────────────────────────────────┤
│            │                                                │
│  Sidebar   │              Main Content                      │
│  (Ivory)   │              (Canvas Cream)                    │
│            │                                                │
│  Dashboard │                                                │
│  Actions   │                                                │
│  Audit     │                                                │
│  Admin     │                                                │
│  Team      │                                                │
│            │                                                │
└────────────┴────────────────────────────────────────────────┘
```

- Sidebar width: 240px
- Active nav item: ivory pill background + cobalt text
- Max content width: 1200px centered

---

## 5. Detailed Page Layouts

### 5.1 Login Page (`/login`)

**Full-screen centered layout**

- Background: Canvas Cream with very soft blue gradient at bottom
- Centered white card (max-width 420px, 16px radius, subtle shadow)
- Large logo + “DeFi Sentinel” wordmark
- Subtitle: “Autonomous Treasury Rebalancer & Yield Sentinel”
- Primary CTA: “Connect Wallet” (filled cobalt pill)
- After connect → SIWE signature flow inside the same card
- Footer note: “Base Sepolia / Ethereum Sepolia”

---

### 5.2 Dashboard (`/dashboard`)

**Most important page**

```
Page Title (24–40px)
┌──────────────────────────────┬─────────────────────────────┐
│                              │                             │
│  Health Factor Card          │  Ask Agent Card             │
│  (large 57–84px number)      │  Textarea + Send button     │
│  Circular progress ring      │                             │
│  Status label                │  [Force Soft Rebalance]     │
│                              │  [Force Safe-Exit]          │
└──────────────────────────────┴─────────────────────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐
│ Collateral │ │    Debt    │ │ Next Poll  │
│  $15,240   │ │  $11,850   │ │  4h 12m    │
└────────────┘ └────────────┘ └────────────┘

Recent Audit Trail (compact table – last 5 entries)
```

- Health Factor number is the visual hero
- Color of the number + ring changes with zone (Forest / Cobalt / Danger)
- Metric cards use Surface Ivory + hairline border
- Force buttons only visible to Operator / Admin

---

### 5.3 Actions / Operator Console (`/actions`)

```
Page Title: Operator Console

┌────────────────────────────────────────────────────────────┐
│ Natural Language Command                                   │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Check health and repay if needed...                    │ │
│ └────────────────────────────────────────────────────────┘ │
│                              [ Send to Agent ] (cobalt)    │
└────────────────────────────────────────────────────────────┘

Quick Actions row
[ Force Soft Rebalance ]  [ Force Safe-Exit ]  [ Emergency Self-Repay ]

Current Execution Status Card
- Live status steps (Simulating → Broadcasting → Confirmed)
- Tx hash (clickable)
- Gas used

Recent Manual Actions table
```

---

### 5.4 Audit Trail (`/audit`)

```
Page Title + Filter bar
[ Date Range ] [ Trigger Type ] [ Status ]  [ Search ]

Full-width data table
┌──────────────┬───────────┬──────┬──────────┬──────────┬─────────┐
│ Timestamp    │ Trigger   │ HF   │ Action   │ Tx Hash  │ Status  │
├──────────────┼───────────┼──────┼──────────┼──────────┼─────────┤
│ 2026-08-02…  │ SCHEDULED │ 1.27 │ Soft     │ 0x7f8a…  │ Success │
│ …            │           │      │          │          │         │
└──────────────┴───────────┴──────┴──────────┴──────────┴─────────┘

Click row → expands or opens right-side drawer with full structured payload
```

- Table uses hairline rows
- Status badges: pill shaped, tinted backgrounds
- Tx Hash always links to block explorer

---

### 5.5 Admin Settings (`/admin`)

**Tabbed interface**

Tabs: `Hard Limits` · `Members` · `Circuit Breaker` · `Notifications`

**Hard Limits tab**
- Form fields with labels above
- Number inputs + Save button (cobalt)

**Members tab**
- Table: Wallet · Role · Actions (Revoke / Change Role)
- “+ Add Member” ghost button

**Circuit Breaker tab**
- Large status indicator (Active / Tripped)
- Failure count
- “Reset Circuit Breaker” button (requires confirmation)

**Notifications tab**
- Discord Webhook URL input
- Save button

---

### 5.6 Team Page (`/team`)

Simple, read-only

```
Page Title: Team

Table
┌────────────────────┬──────────┬────────────┐
│ Wallet             │ Role     │ Joined     │
├────────────────────┼──────────┼────────────┤
│ 0xAdmin...         │ Admin    │ 2026-07-12 │
│ 0xOperator1...     │ Operator │ 2026-07-15 │
│ 0xViewer...        │ Viewer   │ 2026-07-20 │
└────────────────────┴──────────┴────────────┘
```

No edit actions. Pure transparency page.

---

## 6. Do’s and Don’ts (Adapted for DeFi Sentinel)

### Do
- Use `#faf9f7` as the page canvas
- Keep all primary actions in Electric Cobalt
- Use 48px pill radius on every button
- Make Health Factor the largest number on the Dashboard
- Keep cards light (Ivory or White + hairline)

### Don’t
- Never use pure `#ffffff` as the page background
- Never introduce a second filled CTA color
- Never use heavy drop shadows
- Never put dark-mode navy backgrounds (this is a light system)
- Don’t make status colors compete with the cobalt primary action

---

## 7. CSS Variables (Ready to paste)

```css
:root {
  --color-canvas-cream: #faf9f7;
  --color-surface-ivory: #fbfaf7;
  --color-pure-white: #ffffff;
  --color-lavender-mist: #f4f0ff;
  --color-powder-blue: #d6e4f1;
  --color-ink-charcoal: #121722;
  --color-slate-gray: #777c86;
  --color-steel-gray: #a5a5a5;
  --color-hairline: #efefef;
  --color-electric-cobalt: #0068f9;
  --color-deep-cobalt: #024bb1;
  --color-vivid-violet: #6736eb;
  --color-forest: #046645;

  --font-roobert: 'Roobert', Inter, ui-sans-serif, system-ui, sans-serif;

  --radius-cards: 16px;
  --radius-buttons: 48px;
  --radius-navitems: 48px;

  --shadow-subtle: rgba(0, 0, 0, 0.07) 0px 1px 1px 0px,
                   rgba(0, 0, 0, 0.04) 0px -1px 1px 0px inset,
                   rgba(0, 0, 0, 0.14) 0px 0px 0px 0.5px inset;
}
```

---

**Document Status**  
Merged design system + exact page layouts for the testnet phase of DeFi Sentinel.  
Ready for implementation in Tailwind + shadcn/ui.
```

