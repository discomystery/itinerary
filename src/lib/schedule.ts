import type { Anchor, Block, Interest, Item, LatLng, TransitMode, Trip } from '../types'
import { daylight, openStatus } from './hours'
import { distanceMeters, suggestMode, travelMinutes } from './transit'
import { endLocation, flightIssues, flightSpan, isFlight } from './flights'
import { utcToWall, wallToUtc } from './time'

export const INTEREST_SCORE: Record<Interest, number> = { must: 3, yes: 1, meh: 0, no: -2 }

export function interestScore(item: Item): number {
  return Object.values(item.interest).reduce((s, v) => s + INTEREST_SCORE[v], 0)
}

export function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
}

export function dayBlocks(trip: Trip, day: string): Block[] {
  return sortBlocks(trip.blocks.filter((b) => b.day === day))
}

/** Anchor time expressed as minutes relative to midnight of `day` in the trip timezone. */
export function anchorOnDay(anchor: Anchor, day: string, tripTz: string): number {
  let aDay = anchor.day
  let aMin = anchor.time
  if (anchor.tz && anchor.tz !== tripTz) {
    const w = utcToWall(tripTz, wallToUtc(anchor.tz, anchor.day, anchor.time))
    aDay = w.day
    aMin = w.min
  }
  const dayDiff = Math.round((Date.parse(aDay) - Date.parse(day)) / 86400000)
  return dayDiff * 1440 + aMin
}

/** Anchor converted into the trip timezone. */
export function anchorInTrip(anchor: Anchor, tripTz: string): { day: string; min: number } {
  if (!anchor.tz || anchor.tz === tripTz) return { day: anchor.day, min: anchor.time }
  return utcToWall(tripTz, wallToUtc(anchor.tz, anchor.day, anchor.time))
}

/** Where to put a newly scheduled anchored item: first anchor → last anchor + typical (flights: takeoff → landing). */
export function anchoredSlot(item: Item, tripTz: string): { day: string; start: number; end: number } | null {
  if (isFlight(item)) return flightSpan(item.legs, tripTz)
  if (!item.anchors.length) return null
  const conv = item.anchors.map((a) => anchorInTrip(a, tripTz))
  const day = conv.map((c) => c.day).sort()[0]
  // Only the first day's times: a stay's check-out days later isn't part of this slot.
  const mins = item.anchors.filter((_, n) => conv[n].day === day).map((a) => anchorOnDay(a, day, tripTz))
  const start = Math.min(...mins)
  const lastHard = Math.max(...mins)
  return { day, start, end: Math.max(lastHard + item.duration.typical, start + item.duration.min) }
}

export interface Ctx {
  trip: Trip
  item: (id: string) => Item | undefined
  loc: (b: Block) => LatLng | undefined
  /** Where you are once the block is over (differs for flights). */
  locEnd: (b: Block) => LatLng | undefined
  mode: (prev: Block, b: Block) => TransitMode
  travel: (prev: Block, b: Block, modeOverride?: TransitMode) => number
}

export function makeCtx(trip: Trip): Ctx {
  const byId = new Map(trip.items.map((i) => [i.id, i]))
  const item = (id: string) => byId.get(id)
  const loc = (b: Block) => item(b.itemId)?.location
  const locEnd = (b: Block) => {
    const i = item(b.itemId)
    return i && endLocation(i)
  }
  const mode = (prev: Block, b: Block): TransitMode => {
    if (b.modeIn) return b.modeIn
    const a = locEnd(prev)
    const z = loc(b)
    return a && z ? suggestMode(a, z, trip.defaultMode) : trip.defaultMode
  }
  const travel = (prev: Block, b: Block, modeOverride?: TransitMode) => {
    const a = locEnd(prev)
    const z = loc(b)
    if (!a || !z) return 0
    return travelMinutes(a, z, modeOverride ?? mode(prev, b))
  }
  return { trip, item, loc, locEnd, mode, travel }
}

/** Latest acceptable arrival for a locked block: its first hard anchor inside it, else its start. */
export function hardBy(ctx: Ctx, b: Block): number {
  const times = (ctx.item(b.itemId)?.anchors ?? [])
    .filter((a) => a.hard)
    .map((a) => anchorOnDay(a, b.day, ctx.trip.timezone))
    .filter((t) => t >= b.start && t < b.end)
  return times.length ? Math.min(...times) : b.start
}

/** The closest earlier block that has a location (notes don't break legs). */
function prevLocated(ctx: Ctx, sorted: Block[], idx: number): Block | undefined {
  for (let i = idx - 1; i >= 0; i--) if (ctx.loc(sorted[i])) return sorted[i]
  return undefined
}

export type Severity = 'error' | 'warn' | 'info'
export interface Issue {
  kind: 'closed' | 'partial' | 'overlap' | 'anchor' | 'tight' | 'dark' | 'short' | 'flight'
  severity: Severity
  message: string
}

export interface Leg {
  fromId: string
  toId: string
  mode: TransitMode
  minutes: number
  meters: number
  gap: number
  tight: boolean
}

export interface DayAnalysis {
  blocks: Block[]
  legs: Leg[]
  issues: Map<string, Issue[]>
}

function sharesPeople(a: Block, b: Block): boolean {
  if (!a.who?.length || !b.who?.length) return true
  return a.who.some((p) => b.who!.includes(p))
}

export function analyzeDay(trip: Trip, day: string, ctx: Ctx = makeCtx(trip)): DayAnalysis {
  const blocks = dayBlocks(trip, day)
  const legs: Leg[] = []
  const issues = new Map<string, Issue[]>()
  const add = (id: string, issue: Issue) => issues.set(id, [...(issues.get(id) ?? []), issue])

  blocks.forEach((b, i) => {
    const item = ctx.item(b.itemId)
    if (!item) return

    const st = openStatus(item.hours, day, b.start, b.end)
    if (st === 'closed') add(b.id, { kind: 'closed', severity: 'error', message: 'Closed at this time' })
    else if (st === 'partial') add(b.id, { kind: 'partial', severity: 'warn', message: 'Only open for part of this' })

    for (const a of item.anchors) {
      const t = anchorOnDay(a, day, trip.timezone)
      if (Math.abs(t - b.start) > 1440) continue
      if (b.start > t) {
        add(b.id, {
          kind: 'anchor',
          severity: a.hard ? 'error' : 'warn',
          message: `Arrives after ${a.label} (${b.start - t}m late)`,
        })
      }
    }

    if (item.prefersDaylight && item.location) {
      const dl = daylight(day, item.location.lat, item.location.lng, trip.timezone)
      if (dl && (b.end > dl.sunset + 15 || b.start < dl.sunrise - 15)) {
        add(b.id, { kind: 'dark', severity: 'info', message: 'Best in daylight, but this runs into dark' })
      }
    }

    if (isFlight(item)) for (const issue of flightIssues(item.legs, trip.timezone)) add(b.id, issue)

    if (b.end - b.start < item.duration.min) {
      add(b.id, { kind: 'short', severity: 'info', message: 'Shorter than the minimum time this needs' })
    }

    for (let j = 0; j < i; j++) {
      const o = blocks[j]
      if (o.end > b.start && sharesPeople(o, b)) {
        const other = ctx.item(o.itemId)?.title ?? 'another plan'
        add(b.id, { kind: 'overlap', severity: 'error', message: `Overlaps ${other}` })
      }
    }

    const prev = prevLocated(ctx, blocks, i)
    const here = ctx.loc(b)
    if (prev && here) {
      const mode = ctx.mode(prev, b)
      const minutes = ctx.travel(prev, b)
      const gap = b.start - prev.end
      const tight = minutes > 0 && gap < minutes && gap >= 0
      legs.push({
        fromId: prev.id,
        toId: b.id,
        mode,
        minutes,
        meters: distanceMeters(ctx.locEnd(prev) ?? ctx.loc(prev)!, here),
        gap,
        tight,
      })
      if (tight) {
        add(b.id, {
          kind: 'tight',
          severity: b.locked && prev.end + minutes > hardBy(ctx, b) ? 'error' : 'warn',
          message: `~${minutes}m to get here but only ${gap}m gap`,
        })
      }
    }
  })

  return { blocks, legs, issues }
}

export function worstSeverity(list: Issue[] | undefined): Severity | null {
  if (!list?.length) return null
  if (list.some((i) => i.severity === 'error')) return 'error'
  if (list.some((i) => i.severity === 'warn')) return 'warn'
  return 'info'
}

/** First gap on `day` of at least `need` minutes where the item is open (if hours are known). */
export function findSlot(
  trip: Trip,
  day: string,
  item: Item,
  opts: { after?: number; dayStart?: number; dayEnd?: number } = {},
): { start: number; end: number } | null {
  const ctx = makeCtx(trip)
  const blocks = dayBlocks(trip, day)
  const need = item.duration.typical
  const dayStart = Math.max(opts.dayStart ?? 9 * 60, opts.after ?? 0)
  const dayEnd = opts.dayEnd ?? 23 * 60
  const fake = (start: number): Block => ({ id: '_', itemId: item.id, day, start, end: start + need, locked: false })
  for (let t = Math.ceil(dayStart / 15) * 15; t + need <= dayEnd; t += 15) {
    const cand = fake(t)
    const clash = blocks.some((b) => {
      const pad = b.end <= t ? ctx.travel(b, cand) : b.start >= t + need ? ctx.travel(cand, b) : 0
      return b.start < t + need + (b.start >= t + need ? pad : 0) && b.end + (b.end <= t ? pad : 0) > t
    })
    if (clash) continue
    const st = openStatus(item.hours, day, t, t + need)
    if (st === 'closed' || st === 'partial') continue
    return { start: t, end: t + need }
  }
  return null
}
