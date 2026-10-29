import type { Anchor, Block, Item, Trip } from '../types'
import { cardKind, KINDS, spanOf, spansDays, variantOf } from './cards'
import { isFlight } from './flights'
import { anchorInTrip, anchoredSlot } from './schedule'
import { addDays, utcToWall, wallToUtc } from './time'

// One way to say when something happens, used by the card editor, the plan sheet
// and the details pane alike. It reads from (and writes back to) the card's set
// times, its duration and its slot on the plan, so the three never disagree.

export interface When {
  /** Happens at a set time (a show, a booking). Otherwise it goes wherever it fits. */
  set: boolean
  /** Whole days, no times (a festival, a day trip). */
  allDay: boolean
  /** Start and end, in the trip's timezone. `end` is minutes on `endDay`. */
  day: string
  start: number
  endDay: string
  end: number
  /** Can't move: running late never shifts it. */
  fixed: boolean
  /** Roughly how long it takes, for flexible plans. */
  takes: number
  /** Other times worth knowing, like Doors or Boarding. Raw anchors. */
  moments: Anchor[]
  /** The card's own start and end times, when it has them, so their labels and ids carry over. */
  main: Anchor | null
  last: Anchor | null
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

/** Minutes from midnight of `ref`. */
export const absMin = (day: string, min: number, ref: string) => dayDiff(day, ref) * 1440 + min

/** (day, minutes) with minutes kept inside 0–1439. */
export function norm(day: string, min: number): { day: string; min: number } {
  const n = Math.floor(min / 1440)
  return { day: n ? addDays(day, n) : day, min: min - n * 1440 }
}

/** Length of the plan in minutes. */
export const lengthOf = (w: When) => absMin(w.endDay, w.end, w.day) - w.start

function shiftAnchor(a: Anchor, delta: number): Anchor {
  const p = norm(a.day, a.time + delta)
  return { ...a, day: p.day, time: p.min }
}

/** Put an anchor at a trip-time moment, keeping it in its own timezone if it has one. */
function placeAnchor(a: Anchor, day: string, min: number, tripTz: string): Anchor {
  if (!a.tz || a.tz === tripTz) {
    const p = norm(day, min)
    return { ...a, day: p.day, time: p.min }
  }
  const w = utcToWall(a.tz, wallToUtc(tripTz, day, min))
  return { ...a, day: w.day, time: w.min }
}

/** Can this card run across several days? Boarding passes and single fares can't. */
export function canSpan(item: Item) {
  const k = cardKind(item)
  return k !== 'pass' && !(k === 'fare' && variantOf(item) !== 'day')
}

/** Would this start → end run over several days, rather than just past midnight? */
export function isMultiDay(item: Item, w: Pick<When, 'day' | 'endDay' | 'end' | 'allDay'>) {
  if (!canSpan(item)) return false
  if (w.allDay) return w.endDay > w.day
  return spansDays(item, w.day, w.endDay, w.end)
}

/** The labels a new start and end time get on this kind of card. */
export function labelsFor(item: Item) {
  const t = KINDS[cardKind(item)].times ?? []
  const spans = KINDS[cardKind(item)].spans
  return { start: t.includes('Starts') ? 'Starts' : t[0] ?? 'Starts', end: (spans && t[1]) || 'Ends' }
}

const sortAnchors = (anchors: Anchor[], tz: string) =>
  [...anchors].sort((a, b) => {
    const x = anchorInTrip(a, tz)
    const y = anchorInTrip(b, tz)
    return x.day.localeCompare(y.day) || x.min - y.min
  })

/** How an item (and its slot on the plan, if any) reads in the When editor. */
export function readWhen(item: Item, block: Block | undefined, tz: string, fallbackDay: string): When {
  const takes = item.duration.typical || 60
  const base = { takes, moments: [] as Anchor[], fixed: !!block?.locked, main: null, last: null }
  if (isFlight(item) || item.anchors.length) {
    const sorted = sortAnchors(item.anchors, tz)
    const span = spanOf(item, tz)
    if (span) {
      const moments = sorted.filter((a) => a.id !== span.from.anchor.id && a.id !== span.to.anchor.id)
      return {
        ...base,
        set: true,
        allDay: !!span.allDay,
        day: span.from.day,
        start: span.allDay ? 0 : span.from.min,
        endDay: span.to.day,
        end: span.allDay ? 0 : span.to.min,
        fixed: item.anchors.some((a) => a.hard),
        moments,
        main: span.from.anchor,
        last: span.allDay && span.to.anchor.id === span.from.anchor.id ? null : span.to.anchor,
      }
    }
    const slot = anchoredSlot(item, tz)!
    const end = norm(slot.day, slot.end)
    return {
      ...base,
      set: true,
      allDay: false,
      day: slot.day,
      start: slot.start,
      endDay: end.day,
      end: end.min,
      fixed: item.anchors.some((a) => a.hard) || !!block?.locked,
      moments: isFlight(item) ? [] : sorted.slice(1),
      main: sorted[0] ?? null,
    }
  }
  if (block) {
    const end = norm(block.day, block.end)
    return { ...base, set: false, allDay: false, day: block.day, start: block.start, endDay: end.day, end: end.min }
  }
  const start = ['ticket', 'resv', 'voucher'].includes(cardKind(item)) ? 19 * 60 : 10 * 60
  const end = norm(fallbackDay, start + takes)
  return { ...base, set: false, allDay: false, day: fallbackDay, start, endDay: end.day, end: end.min }
}

/** A moment set before the start becomes the start (doors before the show): the plan begins there. */
export function settle(w: When, tz: string): When {
  if (!w.set || w.allDay || !w.moments.length) return w
  const at = (a: Anchor) => {
    const p = anchorInTrip(a, tz)
    return absMin(p.day, p.min, w.day)
  }
  const first = w.moments.reduce((m, a) => (at(a) < at(m) ? a : m))
  if (at(first) >= w.start) return w
  const old = w.main ? [placeAnchor(w.main, w.day, w.start, tz)] : []
  const p = norm(w.day, at(first))
  return { ...w, day: p.day, start: p.min, main: first, moments: [...old, ...w.moments.filter((a) => a.id !== first.id)] }
}

/** Move the start, keeping the length and every moment in step. */
export function moveStart(w: When, day: string, start: number): When {
  const delta = absMin(day, start, w.day) - w.start
  const end = norm(w.endDay, w.end + delta)
  return { ...w, day, start, endDay: end.day, end: end.min, moments: w.moments.map((a) => shiftAnchor(a, delta)) }
}

/** Set the end. An end at or before the start means the next day (a late night out). */
export function moveEnd(w: When, endDay: string, end: number): When {
  if (!w.allDay && absMin(endDay, end, w.day) <= w.start) {
    if (endDay !== w.day) return w
    endDay = addDays(endDay, 1)
  }
  if (w.allDay && endDay < w.day) endDay = w.day
  return { ...w, endDay, end }
}

/** The card fields a When writes: set times, all-day, and how long it takes. */
export function writeWhen(item: Item, w: When, tz: string): Partial<Item> {
  if (isFlight(item)) return {}
  const d = item.duration
  if (!w.set) {
    return { anchors: [], allDay: undefined, duration: { min: Math.min(d.min, w.takes), typical: w.takes, max: Math.max(d.max, w.takes) } }
  }
  const lb = labelsFor(item)
  const main = w.main ?? { id: uid(), label: lb.start, day: w.day, time: w.start, hard: w.fixed }
  const multi = isMultiDay(item, w)
  const allDay = w.allDay
  const anchors: Anchor[] = [placeAnchor(main, w.day, allDay ? 0 : w.start, tz), ...w.moments]
  if (multi) anchors.push(placeAnchor(w.last ?? { id: uid(), label: lb.end, day: w.endDay, time: w.end, hard: false }, w.endDay, allDay ? 0 : w.end, tz))
  const fixedAnchors = w.fixed
    ? anchors.some((a) => a.hard) ? anchors : anchors.map((a, n) => (n === 0 ? { ...a, hard: true } : a))
    : anchors.map((a) => ({ ...a, hard: false }))
  const out: Partial<Item> = { anchors: fixedAnchors, allDay: allDay || undefined }
  if (!multi && !allDay) {
    // The plan ends `typical` after the last time on its first day.
    const len = lengthOf(w)
    const bare = anchoredSlot({ ...item, anchors: fixedAnchors, duration: { min: 0, typical: 0, max: 0 } }, tz)!
    const typical = Math.max(0, absMin(w.endDay, w.end, w.day) - bare.end)
    out.duration = { min: Math.min(d.min, len), typical, max: Math.max(d.max, len) }
  }
  return out
}

let n = 0
const uid = () => `a-${Date.now().toString(36)}${(n++).toString(36)}`

export interface CommitOpts {
  /** The plan being edited, when there's one in view. */
  blockId?: string
  /** Put it on the plan if it isn't yet. */
  addToPlan?: boolean
}

/** Write a When to the card and keep its slot on the plan in step, as one change. */
export function commitWhen(trip: Trip, itemId: string, w: When, opts: CommitOpts = {}): Trip {
  const item = trip.items.find((i) => i.id === itemId)
  if (!item) return trip
  const next: Item = { ...item, ...writeWhen(item, w, trip.timezone) }
  const items = trip.items.map((i) => (i.id === itemId ? next : i))
  const mine = trip.blocks.filter((b) => b.itemId === itemId).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
  const target = (opts.blockId && mine.find((b) => b.id === opts.blockId)) || mine[0]
  let blocks = trip.blocks

  if (w.set && (w.allDay || (isMultiDay(next, w) && !KINDS[cardKind(next)].spans))) {
    // Whole days, and events over several days, show as a ribbon on each day rather than a slot.
    // (Stays and rentals keep theirs: check-in is somewhere to be.)
    blocks = blocks.filter((b) => b.itemId !== itemId)
  } else if (w.set) {
    const slot = isFlight(next) ? null : anchoredSlot(next, trip.timezone)
    const locked = next.anchors.some((a) => a.hard)
    if (slot && target) blocks = blocks.map((b) => (b.id === target.id ? { ...b, day: slot.day, start: slot.start, end: slot.end, locked } : b))
    else if (slot && opts.addToPlan && !isMultiDay(next, w)) blocks = [...blocks, { id: `b-${uid()}`, itemId, day: slot.day, start: slot.start, end: slot.end, locked }]
  } else if (target && opts.blockId) {
    blocks = blocks.map((b) => (b.id === target.id ? { ...b, day: w.day, start: w.start, end: absMin(w.endDay, w.end, w.day), locked: w.fixed } : b))
  }
  return { ...trip, items, blocks }
}

/** "Fri 13, 7:00p – 9:30p", "Fri 13 – Sun 15", "about 1h 30m"… for a summary line. */
export function whenSummary(w: When, clock: (m: number) => string, label: (d: string) => string): string {
  if (w.allDay) return w.endDay > w.day ? `${label(w.day)} – ${label(w.endDay)}` : `${label(w.day)}, all day`
  if (w.endDay > w.day && lengthOf(w) >= 18 * 60) return `${label(w.day)} ${clock(w.start)} – ${label(w.endDay)} ${clock(w.end)}`
  return `${label(w.day)}, ${clock(w.start)} – ${clock(w.end)}`
}
