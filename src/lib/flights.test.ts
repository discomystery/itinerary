import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { FlightLeg, Item, Trip } from '../types'
import { applyLegs, legFromCard, flightIssues, flightSpan, flightStatus, layovers, route, via } from './flights'
import { analyzeDay, anchoredSlot, makeCtx } from './schedule'
import { wallToUtc } from './time'

const TZ = 'Europe/Helsinki'
const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const leg = (from: string, to: string, dep: [string, string], arr: [string, string], flightNo?: string): FlightLeg => ({
  id: `${from}-${to}`,
  from,
  to,
  flightNo,
  depart: { day: dep[0], time: t(dep[1]) },
  arrive: { day: arr[0], time: t(arr[1]) },
})

// RDU 3:10p → JFK 4:50p, then JFK 6:30p → HEL 9:45a next morning.
const outbound = [
  leg('RDU', 'JFK', ['2026-11-10', '15:10'], ['2026-11-10', '16:50'], 'AA 4421'),
  leg('JFK', 'HEL', ['2026-11-10', '18:30'], ['2026-11-11', '09:45'], 'AY 6'),
]

describe('flights', () => {
  it('works out layovers in local airport time', () => {
    const [l] = layovers(outbound, TZ)
    expect(l).toMatchObject({ at: 'JFK', minutes: 100, overnight: false, tight: false, intl: true })
    expect(via(outbound)).toEqual(['JFK'])
    expect(route(outbound)).toBe('RDU → JFK → HEL')
  })

  it('spans first takeoff to final landing in trip time', () => {
    // 3:10p Eastern is 10:10p Helsinki; landing 9:45a next day is 1440 + 585.
    expect(flightSpan(outbound, TZ)).toEqual({ day: '2026-11-10', start: t('22:10'), end: 1440 + t('09:45') })
  })

  it('flags tight, mismatched and impossible connections', () => {
    const tight = [outbound[0], { ...outbound[1], depart: { day: '2026-11-10', time: t('17:40') } }]
    expect(flightIssues(tight, TZ).map((i) => i.message)).toEqual(['Only 50m to connect in JFK (with passport control)'])

    const otherAirport = [outbound[0], { ...outbound[1], from: 'EWR' }]
    expect(flightIssues(otherAirport, TZ)[0]).toMatchObject({ severity: 'warn', message: 'Lands at JFK but the next flight leaves from EWR' })

    const missed = [outbound[0], { ...outbound[1], depart: { day: '2026-11-10', time: t('16:00') } }]
    expect(flightIssues(missed, TZ).some((i) => i.severity === 'error')).toBe(true)

    const backwards = [leg('RDU', 'JFK', ['2026-11-10', '15:10'], ['2026-11-10', '14:00'])]
    expect(flightIssues(backwards, TZ)[0].message).toBe('RDU → JFK lands before it takes off')

    const unknown = [leg('XYZ', 'HEL', ['2026-11-10', '08:00'], ['2026-11-10', '12:00'])]
    expect(flightIssues(unknown, TZ)[0].severity).toBe('info')
  })

  it('notes overnight layovers', () => {
    const red = [
      leg('RDU', 'JFK', ['2026-11-10', '21:00'], ['2026-11-10', '22:40']),
      leg('JFK', 'HEL', ['2026-11-11', '07:00'], ['2026-11-11', '20:00']),
    ]
    const [l] = layovers(red, TZ)
    expect(l.overnight).toBe(true)
    expect(l.long).toBe(true)
    expect(flightIssues(red, TZ).map((i) => i.message)).toEqual(['Overnight layover in JFK. Do you need a hotel?'])
  })

  it('knows which leg you are on', () => {
    const at = (day: string, hhmm: string) => wallToUtc('America/New_York', day, t(hhmm))
    expect(flightStatus(outbound, at('2026-11-10', '14:00'), TZ)).toMatchObject({ kind: 'before', minutes: 70 })
    expect(flightStatus(outbound, at('2026-11-10', '16:00'), TZ)).toMatchObject({ kind: 'leg', index: 0, minutesLeft: 50 })
    expect(flightStatus(outbound, at('2026-11-10', '17:30'), TZ)).toMatchObject({ kind: 'layover', minutesLeft: 60 })
    expect(flightStatus(outbound, at('2026-11-10', '19:00'), TZ)).toMatchObject({ kind: 'leg', index: 1 })
    expect(flightStatus(outbound, at('2026-11-11', '09:00'), TZ)).toMatchObject({ kind: 'landed' })
  })

  it('derives anchors, duration and location from the legs', () => {
    const base = helsinkiTrip().items.find((i) => i.id === 'i-flight-out')!
    const item: Item = { ...base, ...applyLegs(base, outbound, TZ) }
    expect(item.anchors.map((a) => [a.label, a.tz, a.hard])).toEqual([
      ['Departs', 'America/New_York', true],
      ['Arrives', 'Europe/Helsinki', false],
    ])
    expect(item.duration.typical).toBe(1440 + t('09:45') - t('22:10'))
    expect(item.location?.lat).toBeCloseTo(35.88, 1)
    expect(item.details).toMatchObject({ from: 'RDU', to: 'HEL' })
    expect(anchoredSlot(item, TZ)).toEqual(flightSpan(outbound, TZ))

    // Editing again replaces the derived anchors instead of piling them up.
    expect(applyLegs(item, outbound, TZ).anchors).toHaveLength(2)
    expect(applyLegs(item, [], TZ)).toEqual({ legs: undefined, anchors: [] })
  })

  it('turns a single flight card into its first leg', () => {
    const base = helsinkiTrip().items.find((i) => i.id === 'i-flight-out')!
    const card: Item = {
      ...base,
      details: { from: 'RDU', to: 'JFK', airline: 'AA', flight: '4421', seat: '12C' },
      anchors: [
        { id: 'a1', label: 'Departs', day: '2026-11-10', time: t('15:10'), hard: true, tz: 'America/New_York' },
        { id: 'a2', label: 'Arrives', day: '2026-11-10', time: t('16:50'), hard: false, tz: 'America/New_York' },
      ],
    }
    expect(legFromCard(card, '2026-11-10')).toMatchObject({
      from: 'RDU', to: 'JFK', flightNo: 'AA 4421', seat: '12C',
      depart: { day: '2026-11-10', time: t('15:10') },
      arrive: { day: '2026-11-10', time: t('16:50') },
    })
  })

  it('routes the next transit leg from the landing airport', () => {
    const trip = helsinkiTrip()
    const flight = trip.items.find((i) => i.id === 'i-flight-out')!
    const withLegs: Trip = {
      ...trip,
      items: trip.items.map((i) => (i.id === flight.id ? { ...i, ...applyLegs(i, outbound, TZ) } : i)),
      blocks: [
        { id: 'b-fly', itemId: flight.id, ...flightSpan(outbound, TZ), locked: true },
        { id: 'b-train', itemId: 'i-airport-train', day: '2026-11-10', start: 1440 + t('10:30'), end: 1440 + t('11:15'), locked: false },
      ],
    }
    const ctx = makeCtx(withLegs)
    const [fly, train] = withLegs.blocks
    // HEL is where the airport train leaves from, so there's (almost) no travel.
    expect(ctx.travel(fly, train)).toBeLessThan(5)
    const day = analyzeDay(withLegs, '2026-11-10', ctx)
    expect(day.issues.get('b-fly')?.filter((i) => i.severity !== 'info') ?? []).toEqual([])
  })
})
