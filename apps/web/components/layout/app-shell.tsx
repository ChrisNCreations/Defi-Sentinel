'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Zap,
  ScrollText,
  Settings,
  Users,
  Shield,
  LogOut,
} from 'lucide-react'
import type { Role } from '@defi-sentinel/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'operator', 'viewer'] as Role[] },
  { href: '/actions', label: 'Actions', icon: Zap, roles: ['admin', 'operator'] as Role[] },
  { href: '/audit', label: 'Audit Trail', icon: ScrollText, roles: ['admin', 'operator'] as Role[] },
  { href: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] as Role[] },
  { href: '/team', label: 'Team', icon: Users, roles: ['admin'] as Role[] },
]

function shortAddress(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

function roleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function AppShell({
  children,
  wallet,
  role,
}: {
  children: React.ReactNode
  wallet: string
  role: Role
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  const items = NAV.filter((item) => item.roles.includes(role))

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-ivory">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cobalt text-sm font-semibold text-white">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">DeFi Sentinel</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate">
              Treasury Rebalancer
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-pill px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-white text-cobalt shadow-sm'
                    : 'text-slate hover:bg-white/70 hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-hairline px-4 py-4 text-xs text-slate">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-forest" />
            <span className="text-forest">System Status Operational</span>
          </div>
          <p className="mt-2 text-steel">v0.1.0 · Phase 1 auth</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-hairline bg-white px-6">
          <span className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-white px-3 py-1.5 text-xs text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-forest" />
            Base Sepolia
          </span>
          <span className="rounded-pill border border-hairline bg-white px-3 py-1.5 font-mono text-xs text-ink">
            {shortAddress(wallet)}
          </span>
          <span className="rounded-pill bg-lavender px-3 py-1.5 text-xs font-medium text-violet">
            {roleLabel(role)}
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 overflow-auto px-6 py-8">
          <div className="mx-auto max-w-content">{children}</div>
        </main>
      </div>
    </div>
  )
}
