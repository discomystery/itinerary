import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Item } from '../types'
import { ribbonsFor, spanOf } from './cards'
import { anchoredSlot } from './schedule'
import { commitWhen, moveEnd, moveStart, readWhen, settle, writeWhen } from './when'

const TZ = 'Europe/Helsinki'
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
const item = (trip: ReturnType<typeof helsinkiTrip>, id: string) => trip.items.find((i) => i.id === id)!
const blocksOf = (trip: ReturnType<typeof helsinkiTrip>, id: string) => trip.blocks.filter((b) => b.itemId === id)

describe('reading when', () => {
  it('reads a set-time event as its plan: first time to the end, with the rest as moments', () => {
    const trip = helsinkiTrip()
    const w = readWhen(item(trip, 'i-game1'), undefined, TZ, trip.startDay)
    expect(w).toMatchObject({ set: true, allDay: false, day: '2026-11-12', start: 17 * 60 + 30, endDay: '2026-11-12', end: 22 * 60, fixed: true })
    expect(w.moments.map((a) => a.label)).toEqual(['Puck drop'])
  })

  it('reads a stay as check in → check out', () => {
    const trip = helsinkiTrip()
    const w = readWhen(item(trip, 'i-stay'), undefined, TZ, trip.startDay)
    expect(w).toMatchObject({ set: true, day: '2026-11-11', start: 15 * 60, endDay: '2026-11-16', end: 11 * 60 })
    expect([w.main?.label, w.last?.label]).toEqual(['Check in', 'Check out'])
  })

  it('reads a flexible plan from its slot', () => {
    const trip = helsinkiTrip()
    const b = trip.blocks.find((x) => !item(trip, x.itemId).anchors.length)!
    const w = readWhen(item(trip, b.itemId), b, TZ, trip.startDay)
    expect(w).toMatchObject({ set: false, day: b.day, start: b.start })
  })
})

describe('changing when', () => {
  it('moves a set time, its moments and its slot on the plan together', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const w = moveStart(readWhen(game, undefined, TZ, trip.startDay), '2026-11-13', 18 * 60 + 30)
    const next = commitWhen(trip, game.id, w)
    const moved = item(next, game.id)
    expect(anchoredSlot(moved, TZ)).toEqual({ day: '2026-11-13', start: 18 * 60 + 30, end: 23 * 60 })
    expect(moved.anchors.find((a) => a.label === 'Puck drop')).toMatchObject({ day: '2026-11-13', time: 20 * 60 })
    expect(blocksOf(next, game.id)).toEqual([expect.objectContaining({ day: '2026-11-13', start: 18 * 60 + 30, end: 23 * 60, locked: true })])
  })

  it('sets the end time, not a "usual" duration', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const w = moveEnd(readWhen(game, undefined, TZ, trip.startDay), '2026-11-12', 21 * 60 + 30)
    const next = commitWhen(trip, game.id, w)
    expect(anchoredSlot(item(next, game.id), TZ)?.end).toBe(21 * 60 + 30)
  })

  it('treats an end before the start as a late night, still one plan', () => {
    const trip = helsinkiTrip()
    const id = 'i-kallio'
    let w = { ...readWhen(item(trip, id), undefined, TZ, '2026-11-13'), set: true }
    w = moveEnd(moveStart(w, '2026-11-13', 22 * 60), '2026-11-13', 2 * 60)
    expect(w.endDay).toBe('2026-11-14')
    const next = commitWhen(trip, id, w, { addToPlan: true })
    expect(spanOf(item(next, id), TZ)).toBeNull()
    expect(blocksOf(next, id).at(-1)).toMatchObject({ day: '2026-11-13', start: 22 * 60, end: 26 * 60 })
  })

  it('runs anything over several days when the end is on a later day', () => {
    const trip = helsinkiTrip()
    const id = 'i-kallio'
    let w = { ...readWhen(item(trip, id), undefined, TZ, '2026-11-13'), set: true }
    w = moveEnd(moveStart(w, '2026-11-13', 10 * 60), '2026-11-15', 18 * 60)
    const next = commitWhen(trip, id, w)
    const s = spanOf(item(next, id), TZ)!
    expect([s.from.day, s.to.day]).toEqual(['2026-11-13', '2026-11-15'])
    // A ribbon each day rather than a slot.
    expect(blocksOf(next, id)).toEqual([])
    expect(ribbonsFor(next, '2026-11-14', clock).find((r) => r.item.id === id)?.text).toBe('Until Sun 18:00')
  })

  it('makes all-day plans ribbons, for one day or several', () => {
    const trip = helsinkiTrip()
    const id = 'i-kallio'
    const w = { ...readWhen(item(trip, id), undefined, TZ, '2026-11-13'), set: true, allDay: true }
    const one = commitWhen(trip, id, w)
    expect(ribbonsFor(one, '2026-11-13', clock).find((r) => r.item.id === id)?.text).toBe('All day')
    expect(blocksOf(one, id)).toEqual([])
    const three = commitWhen(trip, id, moveEnd(w, '2026-11-15', 0))
    expect(ribbonsFor(three, '2026-11-14', clock).find((r) => r.item.id === id)?.text).toBe('Day 2 of 3')
    expect(readWhen(item(three, id), undefined, TZ, trip.startDay)).toMatchObject({ allDay: true, day: '2026-11-13', endDay: '2026-11-15' })
  })

  it('moves a stay’s check out without losing its labels', () => {
    const trip = helsinkiTrip()
    const stay = item(trip, 'i-stay')
    const next = commitWhen(trip, stay.id, moveEnd(readWhen(stay, undefined, TZ, trip.startDay), '2026-11-15', 10 * 60))
    const out = item(next, stay.id).anchors.find((a) => a.id === 'a-stay-out')
    expect(out).toMatchObject({ label: 'Check out', day: '2026-11-15', time: 10 * 60 })
  })

  it('goes back to flexible: no set times, just how long it takes', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const patch = writeWhen(game, { ...readWhen(game, undefined, TZ, trip.startDay), set: false, takes: 90 }, TZ)
    expect(patch.anchors).toEqual([])
    expect(patch.duration?.typical).toBe(90)
  })

  it('moves a flexible plan’s slot when it’s the one in view', () => {
    const trip = helsinkiTrip()
    const b = trip.blocks.find((x) => !item(trip, x.itemId).anchors.length)!
    const w = moveStart(readWhen(item(trip, b.itemId), b, TZ, trip.startDay), b.day, b.start + 60)
    const next = commitWhen(trip, b.itemId, w, { blockId: b.id })
    expect(next.blocks.find((x) => x.id === b.id)).toMatchObject({ start: b.start + 60, end: b.end + 60 })
  })

  it('puts a newly timed idea on the plan only when asked', () => {
    const trip = helsinkiTrip()
    const idea: Item = { ...item(trip, 'i-kallio'), id: 'i-new' }
    const t = { ...trip, items: [...trip.items, idea] }
    const w = moveStart({ ...readWhen(idea, undefined, TZ, '2026-11-15'), set: true }, '2026-11-15', 19 * 60)
    expect(blocksOf(commitWhen(t, 'i-new', w), 'i-new')).toEqual([])
    expect(blocksOf(commitWhen(t, 'i-new', w, { addToPlan: true }), 'i-new')).toEqual([expect.objectContaining({ day: '2026-11-15', start: 19 * 60 })])
  })

  it('lets a moment before the start become the start (doors before the show)', () => {
    const trip = helsinkiTrip()
    const idea = item(trip, 'i-kallio')
    const w = moveStart({ ...readWhen(idea, undefined, TZ, '2026-11-15'), set: true }, '2026-11-15', 19 * 60)
    const s = settle({ ...w, main: { id: 'm', label: 'Starts', day: w.day, time: w.start, hard: true }, moments: [{ id: 'd', label: 'Doors', day: '2026-11-15', time: 18 * 60 + 30, hard: false }] }, TZ)
    expect(s.start).toBe(18 * 60 + 30)
    expect(s.main?.label).toBe('Doors')
    expect(s.moments.map((a) => [a.label, a.time])).toEqual([['Starts', 19 * 60]])
  })
})
