'use client'

import { Layers, Wallet, TrendingUp, Clock } from 'lucide-react'
import { formatUsd, formatRelative } from '@/lib/format'

interface MetricCardProps {
  label: string
  value: string
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: React.ReactNode
  hint?: string
}

function MetricCard({ label, value, change, changeType, icon, hint }: MetricCardProps) {
  const changeColor =
    changeType === 'positive'
      ? 'text-forest'
      : changeType === 'negative'
        ? 'text-danger'
        : 'text-slate'

  return (
    <div className="flex items-center gap-4 rounded-card border border-hairline bg-white p-5 shadow-subtle">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cobalt/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {change ? (
          <p className={`mt-1 text-xs ${changeColor}`}>
            {change} <span className="text-steel">vs last cycle</span>
          </p>
        ) : hint ? (
          <p className="mt-1 truncate text-xs text-steel">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}

export function MetricCards({
  collateralUsd,
  debtUsd,
  yieldApy,
  nextAutomationMs,
  collateralChange,
  debtChange,
  yieldChange,
  nextAutomationHint,
}: {
  collateralUsd: number | null
  debtUsd: number | null
  yieldApy: number | null
  nextAutomationMs: number | null
  collateralChange: string | null
  debtChange: string | null
  yieldChange: string | null
  nextAutomationHint?: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total Collateral"
        value={formatUsd(collateralUsd)}
        change={collateralChange ?? undefined}
        changeType={collateralChange?.startsWith('+') ? 'positive' : 'negative'}
        icon={<Layers className="h-6 w-6 text-cobalt" />}
      />
      <MetricCard
        label="Total Debt"
        value={formatUsd(debtUsd)}
        change={debtChange ?? undefined}
        changeType={debtChange?.startsWith('+') ? 'negative' : 'positive'}
        icon={<Wallet className="h-6 w-6 text-cobalt" />}
      />
      <MetricCard
        label="Yield (APY)"
        value={yieldApy != null ? `${yieldApy.toFixed(2)}%` : '—'}
        change={yieldChange ?? undefined}
        changeType={yieldChange?.startsWith('+') ? 'positive' : 'negative'}
        icon={<TrendingUp className="h-6 w-6 text-cobalt" />}
      />
      <MetricCard
        label="Next Automation"
        value={
          nextAutomationMs != null && nextAutomationMs > 0
            ? formatRelative(nextAutomationMs)
            : '—'
        }
        hint={nextAutomationHint}
        icon={<Clock className="h-6 w-6 text-cobalt" />}
      />
    </div>
  )
}