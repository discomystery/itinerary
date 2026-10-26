import OpeningHours from 'opening_hours'
import SunCalc from 'suncalc'
import { localDate, utcToWall } from './time'

const cache = new Map<string, OpeningHours | Error>()

export function parseHours(hours: string): OpeningHours | Error {
  const key = hours.trim()
  let hit = cache.get(key)
  if (!hit) {
    try {
      hit = new OpeningHours(key, null)
    } catch (e) {
      hit = e instanceof Error ? e : new Error(String(e))
    }
    cache.set(key, hit)
  }
  return hit
}

export function hoursError(hours: string | undefined): string | null {
  if (!hours?.trim()) return null
  const r = parseHours(hours)
  return r instanceof Error ? r.message.split('\n')[0] : null
}

export type Span = [number, number]

/**
 * Open intervals for a day, in minutes from that day's midnight. Looks into
 * the early hours of the next day so late-night places (bars until 02:00)
 * show as open until 26:00.
 */
export function openSpans(hours: string | undefined, day: string): Span[] | null {
  if (!hours?.trim()) return null
  const oh = parseHours(hours)
  if (oh instanceof Error) return null
  const from = localDate(day, 0)
  const to = localDate(day, 30 * 60)
  const spans: Span[] = []
  for (const [a, b] of oh.getOpenIntervals(from, to)) {
    const s = Math.round((a.getTime() - from.getTime()) / 60000)
    const e = Math.round((b.getTime() - from.getTime()) / 60000)
    if (e > s) spans.push([s, e])
  }
  return spans
}

export type OpenStatus = 'open' | 'closed' | 'partial' | 'unknown'

/** Is the place open for the whole [start, end) range on `day`? */
export function openStatus(hours: string | undefined, day: string, start: number, end: number): OpenStatus {
  const spans = openSpans(hours, day)
  if (!spans) return 'unknown'
  let covered = 0
  for (const [s, e] of spans) covered += Math.max(0, Math.min(e, end) - Math.max(s, start))
  if (covered >= end - start) return 'open'
  if (covered > 0) return 'partial'
  return 'closed'
}

/** One-line human summary of a day's hours, e.g. "10a–6p" or "Closed". */
export function hoursSummary(hours: string | undefined, day: string, fmt: (m: number) => string): string | null {
  const spans = openSpans(hours, day)
  if (!spans) return null
  if (spans.length === 0) return 'Closed'
  if (spans.length === 1 && spans[0][0] <= 0 && spans[0][1] >= 1440) return 'Open 24h'
  return spans.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(', ')
}

export interface Daylight {
  sunrise: number
  sunset: number
}

/** Sunrise/sunset as wall minutes in `timezone` for a day at a location. */
export function daylight(day: string, lat: number, lng: number, timezone: string): Daylight | null {
  const [y, m, d] = day.split('-').map(Number)
  const t = SunCalc.getTimes(new Date(Date.UTC(y, m - 1, d, 12)), lat, lng)
  if (isNaN(t.sunrise.getTime()) || isNaN(t.sunset.getTime())) return null
  const toMin = (dt: Date) => {
    const w = utcToWall(timezone, dt.getTime())
    return w.day === day ? w.min : w.day < day ? w.min - 1440 : w.min + 1440
  }
  return { sunrise: toMin(t.sunrise), sunset: toMin(t.sunset) }
}

