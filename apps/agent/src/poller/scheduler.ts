/**
 * Interval-based poller with single-flight ticks and next-run logging.
 * Uses setInterval (no node-cron dependency). Phase 6.
 */

export interface SchedulerOptions {
  /** Interval between ticks in milliseconds */
  intervalMs: number
  /** Work to run each tick; errors should be handled by the caller or are logged */
  onTick: () => Promise<void>
  /** Run one tick immediately on start (default true) */
  runImmediately?: boolean
  log?: (line: string) => void
  /** Injectable timers for tests */
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  now?: () => number
}

export interface SchedulerHandle {
  stop: () => void
  getNextRunAt: () => Date | null
  isRunning: () => boolean
  /** True while a tick is in progress */
  isTickInFlight: () => boolean
}

/**
 * Start a recurring scheduler. Does not crash the process on tick failures —
 * `onTick` should catch soft errors; uncaught rejections are logged and swallowed.
 */
export function startScheduler(opts: SchedulerOptions): SchedulerHandle {
  if (!Number.isFinite(opts.intervalMs) || opts.intervalMs <= 0) {
    throw new Error(`Invalid poll interval: ${opts.intervalMs}ms`)
  }

  const log = opts.log ?? ((line: string) => console.log(line))
  const setI = opts.setIntervalFn ?? setInterval
  const clearI = opts.clearIntervalFn ?? clearInterval
  const now = opts.now ?? (() => Date.now())

  let stopped = false
  let inFlight = false
  let nextRunAt: Date | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const scheduleNext = () => {
    nextRunAt = new Date(now() + opts.intervalMs)
    log(`[poller] next run at ${nextRunAt.toISOString()} (interval ${formatInterval(opts.intervalMs)})`)
  }

  const tick = async () => {
    if (stopped) return
    if (inFlight) {
      log('[poller] previous tick still running — skipping this interval')
      return
    }

    inFlight = true
    log(`[poller] tick started at ${new Date(now()).toISOString()}`)
    try {
      await opts.onTick()
      log('[poller] tick complete')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log(`[poller] tick error (daemon continues): ${message}`)
    } finally {
      inFlight = false
      if (!stopped) scheduleNext()
    }
  }

  const runImmediately = opts.runImmediately !== false
  if (runImmediately) {
    void tick()
  } else {
    scheduleNext()
  }

  timer = setI(() => {
    void tick()
  }, opts.intervalMs)

  // Allow process to exit if this is the only handle (Node default is ref'd)
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    // Keep process alive for daemon; do not unref
  }

  return {
    stop: () => {
      stopped = true
      if (timer !== null) {
        clearI(timer as ReturnType<typeof setInterval>)
        timer = null
      }
      nextRunAt = null
      log('[poller] stopped')
    },
    getNextRunAt: () => nextRunAt,
    isRunning: () => !stopped,
    isTickInFlight: () => inFlight,
  }
}

export function formatInterval(ms: number): string {
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
    const h = ms / 3_600_000
    return `${h}h`
  }
  if (ms >= 60_000 && ms % 60_000 === 0) {
    return `${ms / 60_000}m`
  }
  if (ms >= 1000 && ms % 1000 === 0) {
    return `${ms / 1000}s`
  }
  return `${ms}ms`
}

/** Resolve poll interval from env (ms override wins). Default: POLL_INTERVAL_HOURS (shared) * 1h. */
export function resolvePollIntervalMs(options: {
  pollIntervalMsEnv?: string
  pollIntervalHoursEnv?: string
  defaultHours: number
}): number {
  const msRaw = options.pollIntervalMsEnv?.trim()
  if (msRaw) {
    const n = Number(msRaw)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  const hoursRaw = options.pollIntervalHoursEnv?.trim()
  if (hoursRaw) {
    const h = Number(hoursRaw)
    if (Number.isFinite(h) && h > 0) return Math.floor(h * 3_600_000)
  }
  return Math.floor(options.defaultHours * 3_600_000)
}
