import { cn } from '@/lib/utils'

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: React.ReactNode
  className?: string
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info'
}) {
  const tones = {
    neutral: 'bg-ivory text-slate border-hairline',
    success: 'bg-forest/10 text-forest border-forest/20',
    warn: 'bg-cobalt/10 text-cobalt border-cobalt/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    info: 'bg-lavender text-violet border-transparent',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-badge border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
