import { Lock, ShieldCheck, KeyRound } from 'lucide-react'

const badges = [
  { icon: Lock, label: 'Non-custodial' },
  { icon: ShieldCheck, label: 'SIWE Protected' },
  { icon: KeyRound, label: 'Your keys, your control' },
]

export function LoginTrustBadges() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-6">
      {badges.map((badge) => {
        const Icon = badge.icon
        return (
          <div key={badge.label} className="flex items-center gap-1.5 text-xs text-slate">
            <Icon className="h-3.5 w-3.5 text-cobalt" />
            <span>{badge.label}</span>
          </div>
        )
      })}
    </div>
  )
}
