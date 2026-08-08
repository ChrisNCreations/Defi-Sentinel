'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Users, ShieldCheck, Eye, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { shortAddress } from '@/lib/format'

interface Member {
  wallet_address: string
  role: string
  created_at?: string
}

interface TeamResponse {
  members: Member[]
  role: string
  wallet: string
}

const ROLE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; tone: 'warn' | 'success' | 'neutral' }> = {
  admin: { icon: ShieldCheck, label: 'Admin', tone: 'warn' },
  operator: { icon: Wrench, label: 'Operator', tone: 'success' },
  viewer: { icon: Eye, label: 'Viewer', tone: 'neutral' },
}

function avatarColor(wallet: string) {
  const seed = wallet.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const palette = ['#0068f9', '#6736eb', '#046645', '#b45309', '#b42318']
  return palette[seed % palette.length]
}

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([])
  const [wallet, setWallet] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/team', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Team ${res.status}`)
      const data = (await res.json()) as TeamResponse
      setMembers(data.members ?? [])
      setWallet(data.wallet ?? '')
      setRole(data.role ?? '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = { admin: 0, operator: 0, viewer: 0 }
  for (const m of members) {
    if (m.role in counts) counts[m.role as keyof typeof counts]++
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team</h1>
          <p className="mt-1 text-sm text-slate">
            Organization roster for transparency. Admins manage roles on the Admin page.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {(['admin', 'operator', 'viewer'] as const).map((r) => {
          const meta = ROLE_META[r]
          const Icon = meta.icon
          const count = counts[r]
          return (
            <Card key={r} className="border-0 shadow-subtle">
              <CardContent className="flex items-center gap-3 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cobalt/10">
                  <Icon className="h-5 w-5 text-cobalt" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate">
                    {meta.label}s
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-ink">{count}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-0 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cobalt" />
            Members
          </CardTitle>
          <CardDescription>
            You are signed in as{' '}
            <span className="font-medium capitalize text-ink">{role}</span> (
            {wallet ? shortAddress(wallet) : '—'}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-hairline text-xs uppercase tracking-wide text-slate">
                <tr>
                  <th className="py-2 pr-4 font-medium">Wallet</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isYou =
                    wallet &&
                    m.wallet_address.toLowerCase() === wallet.toLowerCase()
                  const meta = ROLE_META[m.role] ?? ROLE_META.viewer
                  return (
                    <tr
                      key={m.wallet_address}
                      className="border-b border-hairline/80 last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{
                              backgroundColor: avatarColor(m.wallet_address),
                            }}
                          >
                            {m.wallet_address.slice(2, 4).toUpperCase()}
                          </span>
                          <span className="font-mono text-xs text-ink">
                            {m.wallet_address}
                          </span>
                          {isYou ? (
                            <Badge tone="info" className="ml-1">
                              you
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={meta.tone} className="capitalize">
                          {m.role}
                        </Badge>
                      </td>
                      <td className="py-3 text-slate">
                        {m.created_at
                          ? new Date(m.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-slate">
                      No members found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
