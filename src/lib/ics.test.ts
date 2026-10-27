import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import { fold, tripCalendar } from './ics'

describe('calendar export', () => {
  const trip = helsinkiTrip()

  it('has one event per plan, in UTC', () => {
    const ics = tripCalendar(trip, trip.blocks, Date.UTC(2026, 9, 27))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(trip.blocks.length)
    // Helsinki is UTC+2 in November: the 5:30p game block starts at 15:30Z.
    expect(ics).toContain('DTSTART:20261112T153000Z')
    expect(ics).toContain('DTEND:20261112T200000Z')
  })

  it('escapes text and folds long lines', () => {
    const one = { ...trip, items: trip.items.map((i, n) => (n === 0 ? { ...i, title: 'Dinner; then, sauna', notes: 'a\nb' } : i)) }
    const b = one.blocks.find((x) => x.itemId === one.items[0].id) ?? { id: 'b', itemId: one.items[0].id, day: one.startDay, start: 600, end: 660, locked: false }
    const ics = tripCalendar(one, [b])
    expect(ics).toContain('SUMMARY:Dinner\; then\\, sauna')
    expect(fold('x'.repeat(160)).split('\r\n ').map((l) => l.length)).toEqual([75, 74, 11])
  })
})
