import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Trip } from '../types'
import { costOf } from './costs'
import { applyDay } from './reflow'
import { analyzeDay, makeCtx } from './schedule'
import { audience, audienceLabel, forPerson, hasSplits, travelFor, withoutTrack } from './tracks'

// Me and Friend fly in from Raleigh; Jo flies in from Seattle a day later.
function split(): Trip {
  const t = helsinkiTrip()
  t.people.push({ id: 'p-jo', name: 'Jo', color: '#16a34a' })
  t.tracks = [
    { id: 't-rdu', name: 'Raleigh crew', color: '#0f766e', people: ['p-me', 'p-friend'] },
    { id: 't-sea', name: 'Seattle crew', color: '#b45309', people: ['p-jo'] },
  ]
  const out = t.items.find((i) => i.id === 'i-flight-out')!
  out.track = 't-rdu'
  out.legs = [
    { id: 'l1', from: 'RDU', to: 'JFK', depart: { day: '2026-11-10', time: 7 * 60 }, arrive: { day: '2026-11-10', time: 8 * 60 + 40 } },
    { id: 'l2', from: 'JFK', to: 'HEL', depart: { day: '2026-11-10', time: 17 * 60 }, arrive: { day: '2026-11-11', time: 8 * 60 + 5 } },
  ]
  t.items.push({
    ...out,
    id: 'i-flight-sea',
    title: 'Flight SEA → HEL',
    track: 't-sea',
    legs: [{ id: 'l3', from: 'SEA', to: 'HEL', depart: { day: '2026-11-11', time: 13 * 60 }, arrive: { day: '2026-11-12', time: 10 * 60 } }],
  })
  // Jo's flight lands in the middle of the Raleigh crew's market lunch.
  t.blocks.push({ id: 'b-sea', itemId: 'i-flight-sea', day: '2026-11-12', start: 9 * 60, end: 12 * 60 + 30, locked: true })
  return t
}

describe('tracks', () => {
  it('reads a card’s audience from its track, and a plan can override it', () => {
    const t = split()
    const out = t.items.find((i) => i.id === 'i-flight-out')!
    expect(audience(t, out)).toEqual(['p-me', 'p-friend'])
    const game = t.items.find((i) => i.id === 'i-game1')!
    expect(audience(t, game)).toBeNull()
    const b = t.blocks.find((x) => x.itemId === 'i-game1')!
    expect(audience(t, game, { ...b, who: ['p-jo'] })).toEqual(['p-jo'])
    expect(hasSplits(t)).toBe(true)
    expect(hasSplits(helsinkiTrip())).toBe(false)
  })

  it('names a track, or the people', () => {
    const t = split()
    expect(audienceLabel(t, t.items.find((i) => i.id === 'i-flight-sea'))?.name).toBe('Seattle crew')
    const game = t.items.find((i) => i.id === 'i-game1')!
    expect(audienceLabel(t, { ...game, who: ['p-me', 'p-jo'] })?.name).toBe('Me & Jo')
    expect(audienceLabel(t, game)).toBeNull()
  })

  it('shows each person only their own cards', () => {
    const t = split()
    const jo = forPerson(t, 'p-jo')
    expect(jo.items.some((i) => i.id === 'i-flight-out')).toBe(false)
    expect(jo.blocks.some((b) => b.id === 'b-sea')).toBe(true)
    expect(jo.blocks.some((b) => b.itemId === 'i-game1')).toBe(true)
    const me = forPerson(t, 'p-me')
    expect(me.blocks.some((b) => b.id === 'b-sea')).toBe(false)
  })

  it('flags a plan for everyone while someone is still in the air', () => {
    const t = split()
    const a = analyzeDay(t, '2026-11-12', makeCtx(t, {}))
    expect(a.issues.get('b-1')?.some((i) => i.kind === 'overlap')).toBe(true)
  })

  it('doesn’t flag an overlap between two tracks, and routes each track between its own plans', () => {
    const t = split()
    t.items.find((i) => i.id === 'i-old-market')!.track = 't-rdu'
    const a = analyzeDay(t, '2026-11-12', makeCtx(t, {}))
    expect(a.issues.get('b-sea')?.some((i) => i.kind === 'overlap')).toBeFalsy()
    expect(a.issues.get('b-1')?.some((i) => i.kind === 'overlap')).toBeFalsy()
    // Ateneum's leg comes from the market (the Raleigh crew's lunch), not from Jo's flight.
    expect(a.legs.find((l) => l.toId === 'b-2')?.fromId).toBe('b-1')
  })

  it('still flags an overlap for someone on both', () => {
    const t = split()
    t.items.find((i) => i.id === 'i-old-market')!.track = 't-rdu'
    t.blocks.find((b) => b.id === 'b-sea')!.who = ['p-me']
    const a = analyzeDay(t, '2026-11-12', makeCtx(t, {}))
    expect(a.issues.get('b-1')?.some((i) => i.kind === 'overlap')).toBe(true)
  })

  it('keeps other tracks’ plans when fixing your own day', () => {
    const t = split()
    const mine = forPerson(t, 'p-me').blocks.filter((b) => b.day === '2026-11-12').map((b) => ({ ...b, start: b.start + 30, end: b.end + 30 }))
    const next = applyDay(t, '2026-11-12', mine, [])
    expect(next.find((b) => b.id === 'b-sea')).toEqual(t.blocks.find((b) => b.id === 'b-sea'))
    expect(next.find((b) => b.id === 'b-1')!.start).toBe(12 * 60 + 30)
    expect(next).toHaveLength(t.blocks.length)
  })

  it('splits a cost between a track’s people', () => {
    const t = split()
    const out = { ...t.items.find((i) => i.id === 'i-flight-out')!, cost: { amount: 900, per: 'person' as const } }
    expect(costOf(t, out)).toEqual({ total: 1800, each: 900 })
  })

  it('finds when each person lands and leaves', () => {
    const t = split()
    expect(travelFor(t, 'p-me').arrive).toMatchObject({ day: '2026-11-11', min: 8 * 60 + 5 })
    expect(travelFor(t, 'p-jo').arrive).toMatchObject({ day: '2026-11-12', min: 10 * 60 })
    expect(travelFor(t, 'p-jo').leave).toBeUndefined()
  })

  it('sends a deleted track’s cards back to everyone', () => {
    const t = withoutTrack(split(), 't-sea')
    expect(t.tracks).toHaveLength(1)
    expect(t.items.find((i) => i.id === 'i-flight-sea')!.track).toBeUndefined()
  })
})
