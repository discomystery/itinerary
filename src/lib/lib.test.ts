import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Block, Trip } from '../types'
import { daylight, openSpans, openStatus } from './hours'
import { cascade, runningLate } from './reflow'
import { analyzeDay, anchorInTrip, anchoredSlot, findSlot, makeCtx } from './schedule'
import { nowIn, wallToUtc } from './time'
import { defaultMapsApp, directionsUrl, placeUrl, travelMinutes } from './transit'

const TZ = 'Europe/Helsinki'

describe('time', () => {
  it('round-trips wall time across timezones', () => {
    const utc = wallToUtc(TZ, '2026-11-12', 19 * 60)
    expect(new Date(utc).toISOString()).toBe('2026-11-12T17:00:00.000Z')
    expect(nowIn('America/New_York', new Date(utc))).toEqual({ day: '2026-11-12', min: 12 * 60 })
  })
})

describe('hours', () => {
  it('evaluates opening hours on a given day', () => {
    const h = 'Mo-Fr 08:00-21:00; Sa,Su 10:00-20:00'
    expect(openSpans(h, '2026-11-12')).toEqual([[480, 1260]])
    expect(openSpans(h, '2026-11-14')).toEqual([[600, 1200]])
    expect(openStatus(h, '2026-11-14', 9 * 60, 11 * 60)).toBe('partial')
    expect(openStatus('Mo-Sa 08:00-18:00; Su off', '2026-11-15', 600, 660)).toBe('closed')
    expect(openStatus(undefined, '2026-11-15', 600, 660)).toBe('unknown')
  })

  it('handles past-midnight hours', () => {
    expect(openSpans('Fr 18:00-02:00', '2026-11-13')).toEqual([[1080, 1560]])
  })

  it('computes Helsinki November daylight', () => {
    const dl = daylight('2026-11-13', 60.17, 24.94, TZ)!
    expect(dl.sunrise).toBeGreaterThan(8 * 60)
    expect(dl.sunrise).toBeLessThan(9 * 60)
    expect(dl.sunset).toBeGreaterThan(15 * 60)
    expect(dl.sunset).toBeLessThan(16 * 60)
  })
})

describe('schedule', () => {
  it('converts a home-timezone anchor into trip time', () => {
    expect(anchorInTrip({ id: 'x', label: 'Depart', day: '2026-11-10', time: 17 * 60, hard: true, tz: 'America/New_York' }, TZ)).toEqual({
      day: '2026-11-11',
      min: 0,
    })
  })

  it('places an anchored event from first anchor through the hard one', () => {
    const trip = helsinkiTrip()
    const game = trip.items.find((i) => i.id === 'i-game1')!
    expect(anchoredSlot(game, TZ)).toEqual({ day: '2026-11-12', start: 17 * 60 + 30, end: 22 * 60 })
  })

  it('seed schedule has no errors', () => {
    const trip = helsinkiTrip()
    for (const day of ['2026-11-12', '2026-11-13', '2026-11-14']) {
      const a = analyzeDay(trip, day)
      const errors = [...a.issues.values()].flat().filter((i) => i.severity === 'error')
      expect(errors, day).toEqual([])
    }
  })

  it('flags closed, overlap, late-to-anchor and tight transit', () => {
    const trip = helsinkiTrip()
    trip.blocks.push(
      { id: 'x1', itemId: 'i-old-market', day: '2026-11-15', start: 600, end: 660, locked: false },
      { id: 'x2', itemId: 'i-game1', day: '2026-11-12', start: 19 * 60 + 15, end: 22 * 60, locked: true },
    )
    const sun = analyzeDay(trip, '2026-11-15').issues.get('x1')!
    expect(sun.map((i) => i.kind)).toContain('closed')
    const thu = analyzeDay(trip, '2026-11-12').issues.get('x2')!.map((i) => i.kind)
    expect(thu).toContain('anchor')
    expect(thu).toContain('overlap')
  })

  it('finds an open slot that respects hours and travel', () => {
    const trip = helsinkiTrip()
    const kiasma = trip.items.find((i) => i.id === 'i-kiasma')!
    const slot = findSlot(trip, '2026-11-12', kiasma)!
    expect(slot.start).toBeGreaterThanOrEqual(10 * 60)
    expect(slot.end).toBeLessThanOrEqual(12 * 60)
  })

  it('estimates travel times sensibly', () => {
    const arena = { lat: 60.2054, lng: 24.9284 }
    const market = { lat: 60.1668, lng: 24.9545 }
    const walk = travelMinutes(arena, market, 'walk')
    const tram = travelMinutes(arena, market, 'transit')
    expect(walk).toBeGreaterThan(50)
    expect(tram).toBeLessThan(walk)
  })
})

function thursday(): Trip {
  return helsinkiTrip()
}
const DAY = '2026-11-12'
const byId = (bs: Block[], id: string) => bs.find((b) => b.id === id)!

describe('running late', () => {
  it('absorbs a small delay in slack without touching the game', () => {
    const trip = thursday()
    // At Ateneum (13:30–15:30), 20 min late. Slack before pre-game absorbs it.
    const r = runningLate(trip, DAY, 14 * 60, 20)
    expect(r.base.overruns).toEqual([])
    expect(byId(r.base.blocks, 'b-2').end).toBe(15 * 60 + 50)
    expect(byId(r.base.blocks, 'b-4').start).toBe(17 * 60 + 30)
    expect(r.suggestions).toEqual([])
  })

  it('lets a fixed block give up soft lead-in time (doors) but not its hard anchor', () => {
    const trip = thursday()
    const r = runningLate(trip, DAY, 14 * 60, 60)
    expect(r.base.overruns).toEqual([])
    const game = byId(r.base.blocks, 'b-4')
    expect(game.start).toBeGreaterThan(17 * 60 + 30)
    expect(game.start).toBeLessThanOrEqual(19 * 60)
    expect(game.end).toBe(22 * 60)
  })

  it('never moves a hard anchor and suggests fixes when the push hits it', () => {
    const trip = thursday()
    const r = runningLate(trip, DAY, 14 * 60, 150)
    expect(byId(r.base.blocks, 'b-4').end).toBe(22 * 60)
    expect(r.base.overruns[0].blockId).toBe('b-4')
    expect(r.suggestions.length).toBeGreaterThan(0)
    const ctx = makeCtx(trip)
    for (const s of r.suggestions) {
      const kept = s.blocks.filter((b) => !s.dropped.includes(b.id))
      const c = cascade(ctx, kept, 14 * 60, 0)
      expect(c.overruns, s.label).toEqual([])
      expect(byId(s.blocks, 'b-4').start).toBeLessThanOrEqual(19 * 60)
    }
    expect(r.suggestions.map((s) => s.id)).toContain('skip-b-3')
  })
})

describe('maps links', () => {
  const a = { lat: 60.1699, lng: 24.9384 }
  const b = { lat: 60.1525, lng: 24.9278 }

  it('builds Apple Maps directions with the right travel mode', () => {
    expect(directionsUrl(a, b, 'transit', 'apple')).toBe('https://maps.apple.com/?daddr=60.1525%2C24.9278&dirflg=r&saddr=60.1699%2C24.9384')
    expect(directionsUrl(undefined, b, 'walk', 'apple')).toBe('https://maps.apple.com/?daddr=60.1525%2C24.9278&dirflg=w')
    expect(directionsUrl(a, b, 'drive')).toContain('https://www.google.com/maps/dir/?api=1')
  })

  it('opens a place pinned and labeled', () => {
    expect(placeUrl('Löyly', b, 'apple')).toBe('https://maps.apple.com/?ll=60.1525%2C24.9278&q=L%C3%B6yly')
    expect(placeUrl('Löyly', b, 'google')).toBe('https://www.google.com/maps/search/?api=1&query=60.1525%2C24.9278')
  })

  it('defaults to Apple Maps on Apple devices', () => {
    expect(defaultMapsApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('apple')
    expect(defaultMapsApp('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('apple')
    expect(defaultMapsApp('Mozilla/5.0 (Linux; Android 14)')).toBe('google')
  })
})
