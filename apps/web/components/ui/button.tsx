import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-cobalt text-white shadow-sm hover:bg-cobalt-deep',
        secondary:
          'border border-hairline bg-white text-ink shadow-sm hover:bg-ivory',
        outline:
          'border border-hairline bg-transparent text-ink hover:bg-white hover:shadow-sm',
        ghost: 'text-ink hover:bg-white/80',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-cobalt underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 rounded-pill px-6 py-3',
        sm: 'h-9 rounded-pill px-4 text-xs',
        lg: 'h-12 rounded-pill px-8 text-base',
        icon: 'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
