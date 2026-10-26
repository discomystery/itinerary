import type { Block, Trip } from '../types'
import { fmtDuration, fmtTime } from './time'
import { type Ctx, hardBy, interestScore, makeCtx, sortBlocks } from './schedule'

// "We're running N minutes late": push unlocked blocks back, letting free time
// between plans absorb the delay. Locked blocks never move their end, and can
// only give up soft lead-in time (doors → puck drop): arriving late is fine
// until the first hard anchor. Past that we report the overrun and generate
// fixes for the user to pick.

export interface Overrun {
  blockId: string
  minutes: number
}

export interface Cascade {
  blocks: Block[]
  moved: string[]
  overruns: Overrun[]
}

export function cascade(ctx: Ctx, input: Block[], now: number, delay: number): Cascade {
  const orig = sortBlocks(input)
  const out = orig.map((b) => ({ ...b }))
  const moved = new Set<string>()
  const overruns: Overrun[] = []
  let prevOut: Block | undefined
  let prevOrig: Block | undefined
  let first = true

  const arriveLocked = (b: Block, arrive: number) => {
    const limit = hardBy(ctx, b)
    if (arrive > limit) overruns.push({ blockId: b.id, minutes: arrive - limit })
    else {
      b.start = arrive
      moved.add(b.id)
    }
  }

  for (let i = 0; i < out.length; i++) {
    const b = out[i]
    const o = orig[i]
    if (o.end <= now) {
      if (ctx.loc(o)) {
        prevOut = b
        prevOrig = o
      }
      continue
    }

    if (first) {
      first = false
      if (o.start <= now) {
        // We're in this block now: it ends later (if we're free to stay).
        if (!b.locked) {
          b.end = o.end + delay
          moved.add(b.id)
        }
      } else if (b.locked) {
        arriveLocked(b, o.start + delay)
      } else {
        b.start = o.start + delay
        b.end = o.end + delay
        moved.add(b.id)
      }
    } else if (prevOut && prevOrig) {
      const plannedGap = Math.max(0, o.start - prevOrig.end)
      const need = Math.min(ctx.travel(prevOut, b), plannedGap)
      const required = prevOut.end + need
      if (b.start < required) {
        if (b.locked) arriveLocked(b, required)
        else {
          const dur = b.end - b.start
          b.start = required
          b.end = required + dur
          moved.add(b.id)
        }
      }
    }
    if (ctx.loc(b) || !prevOut) {
      prevOut = b
      prevOrig = o
    }
  }
  return { blocks: out, moved: [...moved], overruns }
}

export interface Suggestion {
  id: string
  label: string
  detail: string
  blocks: Block[]
  /** Blocks removed from the schedule (their items go back to Ideas). */
  dropped: string[]
}

export interface LateResult {
  base: Cascade
  suggestions: Suggestion[]
}

const title = (ctx: Ctx, b: Block) => ctx.item(b.itemId)?.title ?? 'Untitled'

export function runningLate(trip: Trip, day: string, now: number, delay: number): LateResult {
  const ctx = makeCtx(trip)
  const dayBlocks = sortBlocks(trip.blocks.filter((b) => b.day === day))
  const base = cascade(ctx, dayBlocks, now, delay)
  const suggestions: Suggestion[] = []
  if (!base.overruns.length) return { base, suggestions }

  const target = base.overruns[0]
  const targetBlock = dayBlocks.find((b) => b.id === target.blockId)!
  const targetName = title(ctx, targetBlock)
  // Flexible blocks that sit between now and the hard block: what we can trade.
  const flex = dayBlocks.filter((b) => !b.locked && b.end > now && b.start < targetBlock.start)
  const byLowInterest = [...flex].sort(
    (a, b) => interestScore(ctx.item(a.itemId)!) - interestScore(ctx.item(b.itemId)!),
  )

  const solves = (c: Cascade) => !c.overruns.some((o) => o.blockId === target.blockId)

  // 1. Shorten flexible plans down toward their minimum time.
  {
    let need = target.minutes
    const edits = new Map<string, number>()
    for (const b of byLowInterest) {
      if (need <= 0) break
      const item = ctx.item(b.itemId)!
      const cut = Math.min(need, Math.max(0, b.end - b.start - item.duration.min))
      if (cut > 0) {
        edits.set(b.id, cut)
        need -= cut
      }
    }
    if (edits.size) {
      const trial = dayBlocks.map((b) => (edits.has(b.id) ? { ...b, end: b.end - edits.get(b.id)! } : b))
      const c = cascade(ctx, trial, now, delay)
      if (solves(c)) {
        suggestions.push({
          id: 'shorten',
          label: 'Cut some time short',
          detail: [...edits].map(([id, m]) => `${title(ctx, dayBlocks.find((b) => b.id === id)!)} −${fmtDuration(m)}`).join(', '),
          blocks: c.blocks,
          dropped: [],
        })
      }
    }
  }

  // 2. Take a faster mode on legs that aren't already driving.
  {
    const trial = dayBlocks.map((b) =>
      b.end > now && b.start <= targetBlock.start ? { ...b, modeIn: 'drive' as const } : b,
    )
    const changed = dayBlocks.some((b) => b.end > now && b.start <= targetBlock.start && b.modeIn !== 'drive')
    if (changed) {
      const c = cascade(makeCtx({ ...trip, blocks: trial }), trial, now, delay)
      if (solves(c)) {
        suggestions.push({ id: 'taxi', label: `Grab a taxi to ${targetName}`, detail: 'Switch remaining legs to driving', blocks: c.blocks, dropped: [] })
      }
    }
  }

  // 3. Skip one plan (least-wanted first), or move it after the hard block.
  for (const b of byLowInterest) {
    const rest = dayBlocks.filter((x) => x.id !== b.id)
    const c = cascade(ctx, rest, now, delay)
    if (!solves(c)) continue
    const after = c.blocks.find((x) => x.id === targetBlock.id)!
    const dur = b.end - b.start
    const start = after.end + ctx.travel(after, b)
    const next = c.blocks.filter((x) => x.start >= after.end).sort((x, y) => x.start - y.start)[0]
    const fitsAfter = !next || start + dur + ctx.travel(b, next) <= next.start
    if (fitsAfter && start + dur <= 26 * 60) {
      suggestions.push({
        id: `move-${b.id}`,
        label: `Move ${title(ctx, b)} to after ${targetName}`,
        detail: `Pick it back up around ${fmtTime(Math.ceil(start / 5) * 5)}`,
        blocks: sortBlocks([...c.blocks, { ...b, start: Math.ceil(start / 5) * 5, end: Math.ceil(start / 5) * 5 + dur }]),
        dropped: [],
      })
    }
    suggestions.push({
      id: `skip-${b.id}`,
      label: `Skip ${title(ctx, b)}`,
      detail: 'Goes back to Ideas for another day',
      blocks: c.blocks,
      dropped: [b.id],
    })
    if (suggestions.length >= 5) break
  }

  // 4. Nothing single works: skip several, least-wanted first.
  if (!suggestions.some((s) => s.id.startsWith('skip'))) {
    const drop: Block[] = []
    for (const b of byLowInterest) {
      drop.push(b)
      const rest = dayBlocks.filter((x) => !drop.includes(x))
      const c = cascade(ctx, rest, now, delay)
      if (solves(c)) {
        if (drop.length > 1) {
          suggestions.push({
            id: 'skip-many',
            label: `Skip ${drop.length} plans`,
            detail: drop.map((d) => title(ctx, d)).join(', '),
            blocks: c.blocks,
            dropped: drop.map((d) => d.id),
          })
        }
        break
      }
    }
  }

  return { base, suggestions }
}

/** Replace a day's blocks in a trip, returning the new block list. */
export function applyDay(trip: Trip, day: string, blocks: Block[], dropped: string[]): Block[] {
  const keep = trip.blocks.filter((b) => b.day !== day)
  return [...keep, ...blocks.filter((b) => !dropped.includes(b.id))]
}
