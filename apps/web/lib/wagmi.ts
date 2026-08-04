'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia, sepolia } from 'wagmi/chains'

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '00000000000000000000000000000000'

export const wagmiConfig = getDefaultConfig({
  appName: 'DeFi Sentinel',
  projectId,
  chains: [baseSepolia, sepolia],
  ssr: true,
})
