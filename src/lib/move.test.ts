import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Trip } from '../types'
import { canMove, insertAt, insertStart, moveBlock } from './move'
import { makeCtx } from './schedule'

const blk = (t: Trip, id: string) => t.blocks.find((b) => b.id === id)!
const itm = (t: Trip, id: string) => t.items.find((i) => i.id === id)!
// Straight-line travel estimates only, so tests don't depend on fetched routes.
const ctx = (t: Trip) => makeCtx(t, {})

describe('moving plans', () => {
  it('moves a plan to another day and time, keeping its length', () => {
    const t = moveBlock(helsinkiTrip(), 'b-2', '2026-11-13', 15 * 60)
    expect(blk(t, 'b-2')).toMatchObject({ day: '2026-11-13', start: 15 * 60, end: 17 * 60 })
  })

  it('won’t pick up a locked plan', () => {
    const t0 = helsinkiTrip()
    expect(canMove(t0, blk(t0, 'b-4'))).toBe(false)
    expect(moveBlock(t0, 'b-4', '2026-11-13', 10 * 60)).toBe(t0)
  })

  it('moves a card’s set times along with its plan', () => {
    const t0 = helsinkiTrip()
    // A soft time: doors at 4:00p, unlocked.
    itm(t0, 'i-pregame').anchors = [{ id: 'a-x', label: 'Doors', day: '2026-11-12', time: 16 * 60 + 15, hard: false }]
    const t = moveBlock(t0, 'b-3', '2026-11-13', 15 * 60)
    expect(blk(t, 'b-3')).toMatchObject({ day: '2026-11-13', start: 15 * 60 })
    expect(itm(t, 'i-pregame').anchors[0]).toMatchObject({ day: '2026-11-13', time: 15 * 60 })
  })

  it('drops a plan between two others, after the first plus the trip there', () => {
    const t0 = helsinkiTrip()
    // Oodi (Sat) dropped after the market lunch (Thu, ends 1:00p).
    const { trip: t } = insertAt(t0, ctx(t0), { block: blk(t0, 'b-6'), item: itm(t0, 'i-oodi') }, '2026-11-12', 'b-1', 'b-2')
    const oodi = blk(t, 'b-6')
    expect(oodi.day).toBe('2026-11-12')
    expect(oodi.start).toBeGreaterThanOrEqual(13 * 60)
    expect(oodi.start % 5).toBe(0)
    expect(oodi.end - oodi.start).toBe(75)
    // Ateneum shuffles later so the two don't overlap…
    expect(blk(t, 'b-2').start).toBeGreaterThanOrEqual(oodi.end)
    // …but the game, which is locked, stays put.
    expect(blk(t, 'b-4')).toEqual(blk(t0, 'b-4'))
  })

  it('drops at the top of a day just early enough to make the first plan', () => {
    const t0 = helsinkiTrip()
    const start = insertStart(t0, ctx(t0), { block: blk(t0, 'b-7'), item: itm(t0, 'i-rock-church') }, '2026-11-12', undefined, 'b-1')!
    expect(start + 30).toBeLessThanOrEqual(12 * 60)
    expect(start).toBeGreaterThan(10 * 60)
  })

  it('adds an idea where it’s dropped, and keeps a set-time idea to its own day', () => {
    const t0 = helsinkiTrip()
    const { trip: t, blockId } = insertAt(t0, ctx(t0), { item: itm(t0, 'i-cathedral') }, '2026-11-13', 'b-5')
    expect(blk(t, blockId!)).toMatchObject({ itemId: 'i-cathedral', day: '2026-11-13' })
    expect(blk(t, blockId!).start).toBeGreaterThanOrEqual(14 * 60)
    t0.blocks = t0.blocks.filter((b) => b.id !== 'b-9')
    const game = itm(t0, 'i-game2')
    expect(insertAt(t0, ctx(t0), { item: game }, '2026-11-13', 'b-5').blockId).toBeNull()
    const put = insertAt(t0, ctx(t0), { item: game }, '2026-11-14', 'b-6', 'b-7')
    expect(blk(put.trip, put.blockId!)).toMatchObject({ start: 18 * 60 + 30, locked: true })
  })
})
