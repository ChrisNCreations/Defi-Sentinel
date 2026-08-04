/**
 * Discord webhook stub — Phase 8 will harden retries / formatting.
 * Never throws; failures are logged only.
 */
export async function sendDiscordAlert(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) {
    console.warn('[discord] DISCORD_WEBHOOK_URL unset — alert skipped:', message)
    return
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message.slice(0, 1900),
      }),
    })
    if (!res.ok) {
      console.warn('[discord] webhook failed', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.warn('[discord] webhook error', err instanceof Error ? err.message : err)
  }
}

export async function alertCircuitTripped(orgId: string, reason: string): Promise<void> {
  await sendDiscordAlert(
    `🚨 **DeFi Sentinel — circuit breaker tripped**\n` +
      `org: \`${orgId}\`\n` +
      `reason: ${reason}\n` +
      `Further executions are halted until an Admin resets the breaker.`,
  )
}
