import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Item } from '../types'
import { cardKind, coveredByPass, ribbonsFor, spanOf, variantOf } from './cards'
import { anchoredSlot } from './schedule'

const TZ = 'Europe/Helsinki'
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
const base: Item = { id: 'x', title: 'X', type: 'place', anchors: [], duration: { min: 0, typical: 0, max: 0 }, interest: {}, tags: [], createdAt: 0 }

describe('card kinds', () => {
  it('works out the card from type and tags, and lets an explicit card win', () => {
    const trip = helsinkiTrip()
    const k = (id: string) => cardKind(trip.items.find((i) => i.id === id)!)
    expect(k('i-game1')).toBe('ticket')
    expect(k('i-flight-out')).toBe('pass')
    expect(k('i-airport-train')).toBe('fare')
    expect(k('i-stay')).toBe('key')
    expect(k('i-loyly')).toBe('resv')
    expect(k('i-kallio')).toBe('map')
    expect(cardKind({ ...base, type: 'reservation', tags: ['airbnb'] })).toBe('tag')
    expect(cardKind({ ...base, card: 'car' })).toBe('car')
  })

  it('falls back to a valid variant', () => {
    expect(variantOf({ ...base, card: 'pass' })).toBe('flight')
    expect(variantOf({ ...base, card: 'pass', variant: 'ferry' })).toBe('ferry')
    expect(variantOf({ ...base, card: 'pass', variant: 'nonsense' })).toBe('flight')
    expect(variantOf({ ...base, card: 'post' })).toBeUndefined()
  })
})

describe('spanning items', () => {
  const trip = helsinkiTrip()
  const stay = trip.items.find((i) => i.id === 'i-stay')!

  it('runs a stay from check in to check out', () => {
    const s = spanOf(stay, TZ)!
    expect(s.from.day).toBe('2026-11-11')
    expect(s.to.day).toBe('2026-11-16')
  })

  it('shows a ribbon on each day of the stay, counting nights', () => {
    expect(ribbonsFor(trip, '2026-11-10', clock)).toEqual([])
    expect(ribbonsFor(trip, '2026-11-11', clock)[0].text).toBe('Check in 15:00')
    const mid = ribbonsFor(trip, '2026-11-13', clock)[0]
    expect(mid.text).toBe('Night 3 of 5')
    expect(mid.pips).toEqual({ on: 3, total: 5 })
    expect(ribbonsFor(trip, '2026-11-16', clock)[0].text).toBe('Check out 11:00')
  })

  it('drops the ribbon on a day the stay has its own block', () => {
    trip.blocks.push({ id: 'b-in', itemId: 'i-stay', day: '2026-11-11', start: 900, end: 930, locked: false })
    expect(ribbonsFor(trip, '2026-11-11', clock)).toEqual([])
  })

  it('slots a stay on its first day only', () => {
    const slot = anchoredSlot(stay, TZ)!
    expect(slot.day).toBe('2026-11-11')
    expect(slot.start).toBe(15 * 60)
    expect(slot.end).toBeLessThan(24 * 60)
  })
})

describe('city pass', () => {
  it('marks the plans it covers', () => {
    const trip = helsinkiTrip()
    trip.items.push({ ...base, id: 'cp', card: 'cpass', type: 'reservation', details: { covers: 'i-ateneum,i-kiasma' } })
    expect([...coveredByPass(trip)]).toEqual(['i-ateneum', 'i-kiasma'])
  })
})
