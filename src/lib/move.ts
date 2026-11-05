import type { Block, Id, Item, Trip } from '../types'
import { spanOf } from './cards'
import { isFlight } from './flights'
import { type Ctx, anchoredSlot, dayBlocks, findSlot } from './schedule'
import { audience, sharePeople } from './tracks'
import { absMin, commitWhen, readWhen, shiftAll } from './when'

// Moving plans around by dragging them: to another time on a grid, to another
// spot in a day's list, or onto another day. Every move is one change to the
// trip, so a single undo puts it all back.

/** Can this plan be picked up? Locked plans, flights and stays keep their times. */
export function canMove(trip: Trip, b: Block): boolean {
  const item = trip.items.find((i) => i.id === b.itemId)
  return !!item && !b.locked && !isFlight(item) && !spanOf(item, trip.timezone)
}

const clampStart = (m: number) => Math.max(0, Math.min(24 * 60 - 15, m))

/**
 * Put a plan at a new day and start, keeping its length. A card with set times
 * (doors, a start) moves them along with it, so the card and the plan agree.
 */
export function moveBlock(trip: Trip, blockId: Id, day: string, start: number): Trip {
  const b = trip.blocks.find((x) => x.id === blockId)
  if (!b || !canMove(trip, b)) return trip
  start = clampStart(start)
  if (b.day === day && b.start === start) return trip
  const item = trip.items.find((i) => i.id === b.itemId)!
  if (item.anchors.length) {
    const w = readWhen(item, b, trip.timezone, b.day)
    return commitWhen(trip, item.id, shiftAll(w, absMin(day, start, b.day) - b.start), { blockId: b.id })
  }
  return { ...trip, blocks: trip.blocks.map((x) => (x.id === b.id ? { ...x, day, start, end: start + (b.end - b.start) } : x)) }
}

/** What's being dropped: a plan already on the schedule, or an idea from the pool. */
export type Moving = { block: Block; item: Item } | { block?: undefined; item: Item }

const up5 = (m: number) => Math.ceil(m / 5) * 5
const down5 = (m: number) => Math.floor(m / 5) * 5

function lengthOf(m: Moving) {
  return m.block ? m.block.end - m.block.start : m.item.duration.typical || 60
}

/** An idea with set times can only go on its own day, at its own time. */
export function fixedSlot(m: Moving, tz: string) {
  return m.block ? null : anchoredSlot(m.item, tz)
}

/**
 * Where a plan dropped between `prev` and `next` starts: just after `prev` (plus
 * the trip there), else just early enough to make `next`, else where it was.
 */
export function insertStart(trip: Trip, ctx: Ctx, m: Moving, day: string, prevId?: Id, nextId?: Id): number | null {
  const fixed = fixedSlot(m, trip.timezone)
  if (fixed) return fixed.day === day ? fixed.start : null
  const len = lengthOf(m)
  const prev = prevId ? trip.blocks.find((b) => b.id === prevId) : undefined
  const next = nextId ? trip.blocks.find((b) => b.id === nextId) : undefined
  const cand = (start: number): Block => ({ id: m.block?.id ?? '_', itemId: m.item.id, day, start, end: start + len, locked: false, who: m.block?.who, track: m.block?.track })
  if (prev) return clampStart(up5(prev.end + ctx.travel(prev, cand(prev.end))))
  if (next) return clampStart(down5(next.start - ctx.travel(cand(next.start - len), next) - len))
  if (m.block) return m.block.start
  return findSlot(trip, day, m.item)?.start ?? 10 * 60
}

/**
 * Drop a plan (or an idea) into a day's list between two others. Plans after it
 * that someone on it is also on shuffle later if they'd now overlap; a locked
 * one stops the shuffle and the clash shows as usual.
 */
export function insertAt(trip: Trip, ctx: Ctx, m: Moving, day: string, prevId?: Id, nextId?: Id): { trip: Trip; blockId: Id | null } {
  const start = insertStart(trip, ctx, m, day, prevId, nextId)
  if (start == null) return { trip, blockId: null }
  let t = trip
  let id: Id
  if (m.block) {
    if (!canMove(trip, m.block)) return { trip, blockId: null }
    t = moveBlock(t, m.block.id, day, start)
    id = m.block.id
  } else {
    id = `b-${crypto.randomUUID().slice(0, 8)}`
    const end = fixedSlot(m, trip.timezone)?.end ?? start + lengthOf(m)
    t = { ...t, blocks: [...t.blocks, { id, itemId: m.item.id, day, start, end, locked: m.item.anchors.some((a) => a.hard) }] }
  }
  return { trip: ripple(t, ctx, id), blockId: id }
}

/** Push the plans after `id` along so none overlaps it (or the one before), stopping at the first that already fits. */
export function ripple(trip: Trip, ctx: Ctx, id: Id): Trip {
  let t = trip
  const moved = t.blocks.find((b) => b.id === id)
  if (!moved) return t
  const who = (b: Block) => audience(t, t.items.find((i) => i.id === b.itemId), b)
  const mine = who(moved)
  const after = dayBlocks(t, moved.day).filter((b) => b.id !== id && b.start >= moved.start && sharePeople(who(b), mine))
  let prev = moved
  for (const b of after) {
    const ready = prev.end + ctx.travel(prev, b)
    if (b.start >= ready) break
    if (!canMove(t, b)) break
    t = moveBlock(t, b.id, b.day, up5(ready))
    prev = t.blocks.find((x) => x.id === b.id)!
  }
  return t
}
