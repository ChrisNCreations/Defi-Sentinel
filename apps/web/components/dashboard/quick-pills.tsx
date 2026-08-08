'use client'

import { Button } from '@/components/ui/button'

const pills = [
  { label: 'Explain my risk', action: 'Explain my risk' },
  { label: 'Why is HF falling?', action: 'Why is HF falling?' },
  { label: 'Simulate a rebalance', action: 'Simulate a rebalance' },
]

export function QuickPills({ onPillClick }: { onPillClick?: (action: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <Button
          key={pill.label}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPillClick?.(pill.action)}
        >
          {pill.label}
        </Button>
      ))}
    </div>
  )
}
