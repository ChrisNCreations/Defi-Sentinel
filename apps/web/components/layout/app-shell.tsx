'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Zap,
  ScrollText,
  Settings,
  Users,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react'
import type { Role } from '@defi-sentinel/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SentinelWordmark } from '@/components/layout/sentinel-logo'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'operator', 'viewer'] as Role[] },
  { href: '/actions', label: 'Actions', icon: Zap, roles: ['admin', 'operator'] as Role[] },
  { href: '/audit', label: 'Audit Trail', icon: ScrollText, roles: ['admin', 'operator'] as Role[] },
  { href: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] as Role[] },
  { href: '/team', label: 'Team', icon: Users, roles: ['admin', 'operator', 'viewer'] as Role[] },
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
  const [navOpen, setNavOpen] = useState(false)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  const items = NAV.filter((item) => item.roles.includes(role))

  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Primary">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
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
    )
  }

  const accountPills = (
    <>
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
    </>
  )

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-white/90 px-4 backdrop-blur lg:hidden">
        <SentinelWordmark />
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(true)}
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-ivory lg:flex">
        <div className="px-5 py-5">
          <SentinelWordmark />
        </div>
        <NavList />
        <div className="border-t border-hairline px-4 py-4 text-xs text-slate">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-forest" />
            <span className="text-forest">System Operational</span>
          </div>
          <p className="mt-2 text-steel">v0.1.0 · Testnet</p>
        </div>
      </aside>

      {/* Mobile slide-over nav */}
      {navOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-ivory shadow-soft">
            <div className="flex items-center justify-between px-5 py-4">
              <SentinelWordmark />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setNavOpen(false)}
                title="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavList onNavigate={() => setNavOpen(false)} />
            <div className="border-t border-hairline px-5 py-4 text-xs text-slate">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-pill border border-hairline px-3 py-1.5 font-mono text-xs">
                  {shortAddress(wallet)}
                </span>
                <span className="rounded-pill bg-lavender px-3 py-1.5 text-xs font-medium text-violet">
                  {roleLabel(role)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile spacer under fixed top bar */}
      <div className="h-14 shrink-0 lg:hidden" />

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden h-14 items-center justify-end gap-3 border-b border-hairline bg-white px-6 lg:flex">
          {accountPills}
        </header>

        <main className="flex-1 overflow-auto px-4 py-6 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>

        <footer className="border-t border-hairline px-4 py-2 text-xs text-steel lg:hidden">
          Operating on Base Sepolia · v0.1.0
        </footer>
      </div>
    </div>
  )
}