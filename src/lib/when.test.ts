import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Item } from '../types'
import { ribbonsFor, spanOf } from './cards'
import { anchoredSlot } from './schedule'
import { commitWhen, earlyMoments, moveEnd, moveStart, readWhen, shiftAll, writeWhen } from './when'

const TZ = 'Europe/Helsinki'
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
const item = (trip: ReturnType<typeof helsinkiTrip>, id: string) => trip.items.find((i) => i.id === id)!
const blocksOf = (trip: ReturnType<typeof helsinkiTrip>, id: string) => trip.blocks.filter((b) => b.itemId === id)

describe('reading when', () => {
  it('reads a set-time event from its real start, with doors as another time', () => {
    const trip = helsinkiTrip()
    const w = readWhen(item(trip, 'i-game1'), undefined, TZ, trip.startDay)
    expect(w).toMatchObject({ set: true, allDay: false, day: '2026-11-12', start: 19 * 60, endDay: '2026-11-12', end: 22 * 60, fixed: true })
    expect(w.main?.label).toBe('Puck drop')
    expect(w.moments.map((a) => a.label)).toEqual(['Doors (est.)'])
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
  it('moves the whole thing, doors and all, to another day', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const w = moveStart(readWhen(game, undefined, TZ, trip.startDay), '2026-11-13', 20 * 60)
    const next = commitWhen(trip, game.id, w)
    const moved = item(next, game.id)
    expect(anchoredSlot(moved, TZ)).toEqual({ day: '2026-11-13', start: 18 * 60 + 30, end: 23 * 60 })
    expect(moved.anchors.find((a) => a.label === 'Doors (est.)')).toMatchObject({ day: '2026-11-13', time: 18 * 60 + 30 })
    expect(blocksOf(next, game.id)).toEqual([expect.objectContaining({ day: '2026-11-13', start: 18 * 60 + 30, end: 23 * 60, locked: true })])
  })

  it('typing a new start keeps the length but leaves the other times alone', () => {
    const trip = helsinkiTrip()
    const w = moveStart(readWhen(item(trip, 'i-game1'), undefined, TZ, trip.startDay), '2026-11-12', 19 * 60 + 30)
    expect([w.start, w.end]).toEqual([19 * 60 + 30, 22 * 60 + 30])
    expect(w.moments.map((a) => a.time)).toEqual([17 * 60 + 30])
  })

  it('saves a typed start without the end jumping to the other times', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const w = moveStart(readWhen(game, undefined, TZ, trip.startDay), '2026-11-12', 13 * 60)
    const next = commitWhen(trip, game.id, w)
    const back = readWhen(item(next, game.id), blocksOf(next, game.id)[0], TZ, trip.startDay)
    expect([back.start, back.end]).toEqual([13 * 60, 16 * 60])
    expect(back.moments.map((a) => a.time)).toEqual([17 * 60 + 30])
  })

  it('the nudges move every time together', () => {
    const trip = helsinkiTrip()
    const w = shiftAll(readWhen(item(trip, 'i-game1'), undefined, TZ, trip.startDay), 60)
    expect([w.start, w.end, w.moments[0].time]).toEqual([20 * 60, 23 * 60, 18 * 60 + 30])
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

  it('keeps doors before the start as doors, and the start as the start', () => {
    const trip = helsinkiTrip()
    const idea: Item = { ...item(trip, 'i-kallio'), id: 'i-new' }
    const t = { ...trip, items: [...trip.items, idea] }
    let w = moveStart({ ...readWhen(idea, undefined, TZ, '2026-11-15'), set: true }, '2026-11-15', 19 * 60)
    w = { ...w, moments: [{ id: 'd', label: 'Starts', day: '2026-11-15', time: 18 * 60 + 30, hard: false }] }
    expect(earlyMoments(w, TZ).map((x) => x.min)).toEqual([18 * 60 + 30])
    const next = commitWhen(t, 'i-new', w, { addToPlan: true })
    const back = readWhen(item(next, 'i-new'), blocksOf(next, 'i-new')[0], TZ, '2026-11-15')
    // Even a label that sounds like a start stays a side time: the card remembers which one is the start.
    expect(back.start).toBe(19 * 60)
    expect(back.moments.map((a) => [a.label, a.time])).toEqual([['Starts', 18 * 60 + 30]])
    // On the plan you're there from the earliest time.
    expect(blocksOf(next, 'i-new')[0]).toMatchObject({ start: 18 * 60 + 30 })
  })

  it('keeps a can’t-miss time when the start itself can move', () => {
    const trip = helsinkiTrip()
    const game = item(trip, 'i-game1')
    const w = readWhen(game, undefined, TZ, trip.startDay)
    const next = commitWhen(trip, game.id, { ...w, fixed: false, moments: w.moments.map((a) => ({ ...a, hard: true })) })
    const back = readWhen(item(next, game.id), undefined, TZ, trip.startDay)
    expect(back.fixed).toBe(false)
    expect(back.moments[0].hard).toBe(true)
  })
})
