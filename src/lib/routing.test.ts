import { describe, expect, it } from 'vitest'
import type { Trip } from '../types'
import { analyzeDay, makeCtx } from './schedule'
import { bestDeparture, delayText, lineName, parseDepartures, parseDigitransit, parseOsrm, parseTransitous, type Route, type RouteRequest, routeKey } from './routing'

const TZ = 'Europe/Helsinki'
const A = { lat: 60.1699, lng: 24.9384 }
const B = { lat: 60.2054, lng: 24.9284 }
const req: RouteRequest = { key: 'k', from: A, to: B, mode: 'transit', day: '2026-11-12', arriveBy: 18 * 60, timezone: TZ }

describe('routing parsers', () => {
  it('reads OSRM walk and taxi times', () => {
    const data = { code: 'Ok', routes: [{ duration: 1500, distance: 4321.4 }] }
    expect(parseOsrm(data, 'walk')).toMatchObject({ minutes: 25, meters: 4321, source: 'osm' })
    expect(parseOsrm(data, 'drive')?.minutes).toBe(30)
    expect(parseOsrm({ code: 'NoRoute', routes: [] }, 'walk')).toBeNull()
  })

  it('reads a Transitous itinerary, leaving as late as possible', () => {
    const data = {
      itineraries: [
        { startTime: '2026-11-12T15:20:00Z', endTime: '2026-11-12T15:40:00Z', duration: 1200, legs: [{ mode: 'BUS', routeShortName: '23' }] },
        // Leaves later but arrives after 6p, so it doesn't count.
        { startTime: '2026-11-12T15:50:00Z', endTime: '2026-11-12T16:05:00Z', duration: 900, legs: [{ mode: 'BUS', routeShortName: '57' }] },
        {
          startTime: '2026-11-12T15:38:00Z',
          endTime: '2026-11-12T15:56:00Z',
          duration: 1080,
          legs: [
            { mode: 'WALK', distance: 300 },
            { mode: 'TRAM', routeShortName: '4' },
            { mode: 'WALK', distance: 120 },
          ],
        },
      ],
    }
    // 15:38Z is 17:38 in Helsinki.
    expect(parseTransitous(data, req)).toMatchObject({ minutes: 18, leave: 17 * 60 + 38, line: 'Tram 4', source: 'transitous' })
    expect(parseTransitous({ itineraries: [] }, req)).toBeNull()
  })

  it('reads a Digitransit plan and names transfers', () => {
    const node = (start: string, legs: unknown[]) => ({ node: { start, duration: 1500, legs } })
    const data = {
      data: {
        planConnection: {
          edges: [
            node('2026-11-12T17:10:00+02:00', [{ mode: 'SUBWAY', route: { shortName: 'M1' } }, { mode: 'BUS', route: { shortName: '55' } }]),
            node('2026-11-12T17:00:00+02:00', [{ mode: 'TRAM', route: { shortName: '7' } }]),
          ],
        },
      },
    }
    expect(parseDigitransit(data, req)).toMatchObject({ minutes: 25, leave: 17 * 60 + 10, line: 'M1 → Bus 55', source: 'hsl' })
  })

  it('keeps a departure before midnight on the arrival day', () => {
    const late = { ...req, day: '2026-11-13', arriveBy: 15 }
    const data = { itineraries: [{ startTime: '2026-11-12T21:50:00Z', endTime: '2026-11-12T22:10:00Z', duration: 1200, legs: [] }] }
    // 23:50 the night before = -10 minutes on the 13th.
    expect(parseTransitous(data, late)?.leave).toBe(-10)
  })

  it('names lines', () => {
    expect(lineName('TRAM', '4')).toBe('Tram 4')
    expect(lineName('SUBWAY', 'M2')).toBe('M2')
    expect(lineName('FERRY')).toBe('Ferry')
  })
})

describe('legs with fetched routes', () => {
  const trip: Trip = {
    id: 't',
    name: 't',
    startDay: '2026-11-12',
    endDay: '2026-11-12',
    timezone: TZ,
    center: A,
    people: [],
    defaultMode: 'transit',
    items: [
      { id: 'a', title: 'Lunch', type: 'place', location: A, anchors: [], duration: { min: 30, typical: 60, max: 90 }, interest: {}, tags: [], createdAt: 0 },
      { id: 'b', title: 'Game', type: 'event', location: B, anchors: [], duration: { min: 60, typical: 180, max: 200 }, interest: {}, tags: [], createdAt: 0 },
    ],
    blocks: [
      { id: 'b1', itemId: 'a', day: '2026-11-12', start: 16 * 60, end: 17 * 60 + 30, locked: false },
      { id: 'b2', itemId: 'b', day: '2026-11-12', start: 18 * 60, end: 21 * 60, locked: true },
    ],
  }
  const key = routeKey(A, B, 'transit', '2026-11-12', 18 * 60)
  const route = (leave: number): Route => ({ minutes: 18, leave, line: 'Tram 4', source: 'hsl', fetchedAt: Date.now() })

  it('asks for the routes it does not have and falls back to the estimate', () => {
    const a = analyzeDay(trip, '2026-11-12', makeCtx(trip, {}))
    expect(a.legs[0].live).toBe(false)
    expect(a.missing.map((r) => r.key)).toEqual([key])
  })

  it('uses the timetable to decide whether a connection is tight', () => {
    const ok = analyzeDay(trip, '2026-11-12', makeCtx(trip, { [key]: route(17 * 60 + 38) }))
    expect(ok.legs[0]).toMatchObject({ live: true, minutes: 18, line: 'Tram 4', leave: 17 * 60 + 38, tight: false })
    expect(ok.missing).toEqual([])

    // The last tram that makes it leaves before lunch is over.
    const tight = analyzeDay(trip, '2026-11-12', makeCtx(trip, { [key]: route(17 * 60 + 20) }))
    expect(tight.legs[0].tight).toBe(true)
    expect(tight.issues.get('b2')?.[0].message).toMatch(/Tram 4.*5:20p/)
  })
})

describe('live departures', () => {
  const leg = (mode: string, start: string, sched: string, extra: object = {}) => ({ mode, startTime: start, scheduledStartTime: sched, ...extra })
  const data = {
    itineraries: [
      {
        startTime: '2026-11-12T15:30:00Z',
        endTime: '2026-11-12T15:52:00Z',
        legs: [leg('WALK', '2026-11-12T15:30:00Z', '2026-11-12T15:30:00Z'), leg('TRAM', '2026-11-12T15:36:00Z', '2026-11-12T15:34:00Z', { routeShortName: '7', realTime: true })],
      },
      {
        startTime: '2026-11-12T15:20:00Z',
        endTime: '2026-11-12T15:44:00Z',
        legs: [leg('SUBURBAN', '2026-11-12T15:24:00Z', '2026-11-12T15:24:00Z', { routeShortName: 'D' })],
      },
      // Walking only: not a departure.
      { startTime: '2026-11-12T15:20:00Z', endTime: '2026-11-12T16:10:00Z', legs: [leg('WALK', '2026-11-12T15:20:00Z', '2026-11-12T15:20:00Z')] },
    ],
  }
  const deps = parseDepartures(data, '2026-11-12', TZ)

  it('reads departures in order, with live delays', () => {
    expect(deps).toEqual([
      { leave: 17 * 60 + 20, depart: 17 * 60 + 24, arrive: 17 * 60 + 44, line: 'Train D', delay: 0, realTime: false },
      { leave: 17 * 60 + 30, depart: 17 * 60 + 36, arrive: 17 * 60 + 52, line: 'Tram 7', delay: 2, realTime: true },
    ])
    expect(deps.map(delayText)).toEqual(['scheduled', '2 min late'])
  })

  it('picks the latest departure that still arrives in time', () => {
    expect(bestDeparture(deps, 18 * 60)?.line).toBe('Tram 7')
    expect(bestDeparture(deps, 17 * 60 + 45)?.line).toBe('Train D')
    // Nothing makes it: the soonest one.
    expect(bestDeparture(deps, 17 * 60)?.line).toBe('Train D')
  })
})
