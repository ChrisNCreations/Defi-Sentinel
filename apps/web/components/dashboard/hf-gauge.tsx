'use client'

import { cn } from '@/lib/utils'
import { formatHf, hfZone, hfZoneLabel, hfZoneColor, type HfZone } from '@/lib/format'
import { HF_SOFT_REBALANCE } from '@defi-sentinel/shared'

function gaugeColor(zone: HfZone) {
  if (zone === 'danger') return '#b42318'
  if (zone === 'soft') return '#f59e0b'
  return '#046645'
}

function gaugeGradient(zone: HfZone) {
  if (zone === 'danger') {
    return ['#b42318', '#f59e0b', '#046645']
  }
  if (zone === 'soft') {
    return ['#046645', '#f59e0b', '#b42318']
  }
  return ['#046645', '#046645', '#046645']
}

export function HfGauge({
  healthFactor,
  className,
}: {
  healthFactor: number | null
  className?: string
}) {
  const zone = hfZone(healthFactor)
  const size = 280
  const strokeWidth = 16
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2

  // Semi-circle: 180 degrees
  // Map HF 0.8-2.2 to progress (0-100%)
  const hf = healthFactor != null && Number.isFinite(healthFactor) ? healthFactor : 1.5
  const clamped = Math.min(Math.max(hf, 0.8), 2.2)
  const progress = (clamped - 0.8) / (2.2 - 0.8)

  // Arc length for semi-circle
  const arcLength = Math.PI * r

  // Current arc length based on progress
  const currentArc = arcLength * progress

  const color = gaugeColor(zone)
  const gradientColors = gaugeGradient(zone)

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size / 2 + 40 }}>
        <svg
          width={size}
          height={size / 2 + 40}
          viewBox={`0 0 ${size} ${size / 2 + 40}`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gradientColors[0]} />
              <stop offset="50%" stopColor={gradientColors[1]} />
              <stop offset="100%" stopColor={gradientColors[2]} />
            </linearGradient>
          </defs>

          {/* Background arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#efefef"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${currentArc} ${arcLength}`}
            className="transition-all duration-700 ease-out"
          />

          {/* Indicator dot */}
          {healthFactor != null && (
            <circle
              cx={cx - r + (arcLength * progress)}
              cy={cy}
              r={8}
              fill={color}
              stroke="white"
              strokeWidth={3}
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
          <p
            className={cn(
              'text-6xl font-bold tabular-nums tracking-tight',
              hfZoneColor(zone),
            )}
          >
            {formatHf(healthFactor)}
          </p>
          <p className="mt-1 text-sm font-medium text-slate">{hfZoneLabel(zone)}</p>
          <p className="mt-1 text-xs text-steel">Target: &gt; {HF_SOFT_REBALANCE}</p>
        </div>
      </div>

      {/* Status badge */}
      <div
        className={cn(
          'mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
          zone === 'safe' && 'bg-forest/10 text-forest',
          zone === 'soft' && 'bg-cobalt/10 text-cobalt',
          zone === 'danger' && 'bg-danger/10 text-danger',
        )}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span>
          {zone === 'danger'
            ? 'Safe-Exit zone — Operators alerted'
            : zone === 'soft'
              ? 'Soft rebalance zone — scheduled check queued'
              : 'Position is healthy. Monitoring continues.'}
        </span>
      </div>
    </div>
  )
}
