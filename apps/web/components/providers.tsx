'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { useState, type ReactNode } from 'react'
import { wagmiConfig } from '@/lib/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#0068f9',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
