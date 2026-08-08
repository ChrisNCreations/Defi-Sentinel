'use client'

import { cn } from '@/lib/utils'
import { formatHf, hfZone, hfZoneColor, hfZoneLabel, type HfZone } from '@/lib/format'

function ringStroke(zone: HfZone) {
  if (zone === 'danger') return '#b42318'
  if (zone === 'soft') return '#0068f9'
  return '#046645'
}

/** Circular health-factor display — signature dashboard element */
export function HfRing({
  healthFactor,
  className,
}: {
  healthFactor: number | null
  className?: string
}) {
  const zone = hfZone(healthFactor)
  const size = 168
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // Map HF 1.0–2.0 to fill; safe high HF → full ring
  const hf = healthFactor != null && Number.isFinite(healthFactor) ? healthFactor : 2
  const clamped = Math.min(Math.max(hf, 0.8), 2.2)
  const progress = (clamped - 0.8) / (2.2 - 0.8)
  const dash = c * progress

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#efefef"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringStroke(zone)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={cn('text-5xl font-semibold tabular-nums tracking-tight', hfZoneColor(zone))}>
            {formatHf(healthFactor)}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate">
            Health factor
          </p>
        </div>
      </div>
      <p
        className={cn(
          'mt-4 rounded-badge px-3 py-1 text-sm font-medium',
          zone === 'safe' && 'bg-forest/10 text-forest',
          zone === 'soft' && 'bg-cobalt/10 text-cobalt',
          zone === 'danger' && 'bg-danger/10 text-danger',
        )}
      >
        {hfZoneLabel(zone)}
      </p>
    </div>
  )
}
