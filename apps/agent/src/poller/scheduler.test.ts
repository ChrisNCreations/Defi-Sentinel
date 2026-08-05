import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatInterval,
  resolvePollIntervalMs,
  startScheduler,
} from './scheduler'

describe('formatInterval', () => {
  it('formats hours, minutes, seconds, ms', () => {
    expect(formatInterval(6 * 3_600_000)).toBe('6h')
    expect(formatInterval(60_000)).toBe('1m')
    expect(formatInterval(5_000)).toBe('5s')
    expect(formatInterval(250)).toBe('250ms')
  })
})

describe('resolvePollIntervalMs', () => {
  it('prefers POLL_INTERVAL_MS over hours', () => {
    expect(
      resolvePollIntervalMs({
        pollIntervalMsEnv: '15000',
        pollIntervalHoursEnv: '6',
        defaultHours: 6,
      }),
    ).toBe(15_000)
  })

  it('uses hours when ms unset', () => {
    expect(
      resolvePollIntervalMs({
        pollIntervalHoursEnv: '2',
        defaultHours: 6,
      }),
    ).toBe(2 * 3_600_000)
  })

  it('falls back to default hours', () => {
    expect(resolvePollIntervalMs({ defaultHours: 6 })).toBe(6 * 3_600_000)
  })
})

describe('startScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs immediately by default and skips overlapping ticks', async () => {
    vi.useFakeTimers()
    const logs: string[] = []
    let resolveTick!: () => void
    let tickCount = 0

    const handle = startScheduler({
      intervalMs: 1000,
      runImmediately: true,
      log: (l) => logs.push(l),
      now: () => Date.now(),
      onTick: async () => {
        tickCount += 1
        await new Promise<void>((r) => {
          resolveTick = r
        })
      },
    })

    // First tick in flight
    await Promise.resolve()
    expect(tickCount).toBe(1)
    expect(handle.isTickInFlight()).toBe(true)

    // Interval fires while still in flight → skip
    await vi.advanceTimersByTimeAsync(1000)
    expect(tickCount).toBe(1)
    expect(logs.some((l) => l.includes('skipping'))).toBe(true)

    resolveTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(handle.isTickInFlight()).toBe(false)

    handle.stop()
    expect(handle.isRunning()).toBe(false)
    expect(logs.some((l) => l.includes('stopped'))).toBe(true)
  })

  it('defers first tick when runImmediately is false', async () => {
    vi.useFakeTimers()
    let tickCount = 0
    const logs: string[] = []

    const handle = startScheduler({
      intervalMs: 5000,
      runImmediately: false,
      log: (l) => logs.push(l),
      onTick: async () => {
        tickCount += 1
      },
    })

    expect(tickCount).toBe(0)
    expect(logs.some((l) => l.includes('next run at'))).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(tickCount).toBe(1)

    handle.stop()
  })

  it('swallows tick errors and continues', async () => {
    vi.useFakeTimers()
    const logs: string[] = []
    let calls = 0

    const handle = startScheduler({
      intervalMs: 1000,
      runImmediately: true,
      log: (l) => logs.push(l),
      onTick: async () => {
        calls += 1
        if (calls === 1) throw new Error('RPC_DOWN')
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(logs.some((l) => l.includes('RPC_DOWN'))).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(calls).toBe(2)

    handle.stop()
  })

  it('rejects non-positive interval', () => {
    expect(() =>
      startScheduler({
        intervalMs: 0,
        onTick: async () => {},
      }),
    ).toThrow(/Invalid poll interval/)
  })
})
