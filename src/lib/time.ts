// Wall-clock helpers. We deliberately avoid real Date math for schedule
// positions: a block is (day, minutes) in the trip timezone, full stop.

export function fmtTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  const suffix = h < 12 ? 'a' : 'p'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return mm === 0 ? `${h12}${suffix}` : `${h12}:${String(mm).padStart(2, '0')}${suffix}`
}

export function fmtDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

/** "19:30" -> 1170 */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function dayRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 60; d = addDays(d, 1)) out.push(d)
  return out
}

export function dayLabel(day: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: style === 'long' ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A Date whose *local* fields equal the given wall time. opening_hours and
 * suncalc-on-local-noon both read local getters, so this lets us evaluate
 * Helsinki hours correctly regardless of the browser's timezone.
 */
export function localDate(day: string, min: number): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 0, Math.round(min))
}

/** Current wall time in a timezone, as (day, minutes). */
export function nowIn(timezone: string, at: Date = new Date()): { day: string; min: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    min: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** Offset in minutes of `timezone` from UTC at a given instant. */
export function tzOffset(timezone: string, at: Date): number {
  const { day, min } = nowIn(timezone, at)
  const [y, m, d] = day.split('-').map(Number)
  const asUtc = Date.UTC(y, m - 1, d) + min * 60000
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

/** Convert a UTC instant to a wall time in the timezone. */
export function utcToWall(timezone: string, utcMs: number) {
  return nowIn(timezone, new Date(utcMs))
}

/** Convert a wall time in a timezone to a UTC instant (ms). */
export function wallToUtc(timezone: string, day: string, min: number): number {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d) + min * 60000
  const off = tzOffset(timezone, new Date(guess))
  const first = guess - off * 60000
  const off2 = tzOffset(timezone, new Date(first))
  return guess - off2 * 60000
}

export function snap(min: number, step = 15): number {
  return Math.round(min / step) * step
}
