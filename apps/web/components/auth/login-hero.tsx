import { Circle, Hexagon } from 'lucide-react'
import { SentinelLogo } from '@/components/layout/sentinel-logo'

export function LoginHero() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0e1a] px-8 py-16 text-white">
      {/* Orbital rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="absolute h-[640px] w-[640px] rounded-full border border-white/5" />
        <div className="absolute h-[480px] w-[480px] rounded-full border border-white/10" />
        <div className="absolute h-[320px] w-[320px] rounded-full border border-white/15" />
        <div className="absolute h-[170px] w-[170px] rounded-full border border-cobalt/30" />
      </div>

      {/* Floating beacons */}
      <div className="pointer-events-none absolute top-1/4 left-1/4 h-2 w-2 rounded-full bg-cobalt/50" />
      <div className="pointer-events-none absolute right-1/3 top-1/3 h-1.5 w-1.5 rounded-full bg-violet/50" />
      <div className="pointer-events-none absolute bottom-1/3 left-1/3 h-1 w-1 rounded-full bg-cobalt/40" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <SentinelLogo className="mb-8 h-20 w-20" />

        <h1 className="text-4xl font-bold tracking-tight">DeFi Sentinel</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate/80">
          AUTONOMOUS TREASURY REBALANCER &amp; YIELD SENTINEL
        </p>
        <p className="mt-8 max-w-md text-base leading-relaxed text-slate/70">
          Autonomous. Intelligent. Secure.
          <br />
          Protect and optimize your treasury with
          <br />
          AI-powered rebalancing and real-time monitoring.
        </p>

        <div className="mt-12 rounded-card border border-white/10 bg-white/5 px-6 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate/60">
            Supported Networks
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cobalt">
                <Circle className="h-3 w-3 fill-white text-white" />
              </div>
              <span className="text-sm font-medium">Base Sepolia</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate/30">
                <Hexagon className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium">Ethereum Sepolia</span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate/40">Testnet · v0.1.0</p>
      </div>
    </div>
  )
}