import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * DeFi Sentinel brand mark — a cobalt-to-violet beacon with an inset watch ring.
 * Gradient ids are scoped per instance via useId to avoid duplicate-SVG-id issues.
 */
export function SentinelLogo({ className }: { className?: string }) {
  const uid = useId()

  return (
    <svg viewBox="0 0 36 36" className={cn('h-9 w-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0068f9" />
          <stop offset="100%" stopColor="#6736eb" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="11" fill={`url(#${uid}-bg)`} />
      <path
        d="M18 10.5 23 12.6v6c0 4.4-2.2 7.4-5 9.1-2.8-1.7-5-4.7-5-9.1v-6l5-2.1z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="15.4" r="2.3" fill="#ffffff" />
      <circle cx="18" cy="15.4" r="4" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  )
}

export function SentinelWordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <SentinelLogo className="h-9 w-9" />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-ink">DeFi Sentinel</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate">
          Treasury Rebalancer
        </p>
      </div>
    </div>
  )
}