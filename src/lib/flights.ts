// Multi-leg flights. A flight item carries its legs, each timed in the local
// time of the airport it leaves from or lands at. Everything else (layovers,
// the scheduled span, the "Departs"/"Lands" anchors) is worked out from them.

import type { Anchor, FlightLeg, Item, LatLng } from '../types'
import type { Issue } from './schedule'
import { fmtDuration, utcToWall, wallToUtc } from './time'

export interface Airport extends LatLng {
  city: string
  tz: string
  /** ISO country code; changing country means passport control on a connection. */
  country: string
}

// A starter set of airports. Anything missing still works if the leg's
// timezone is set by hand.
export const AIRPORTS: Record<string, Airport> = {
  RDU: { city: 'Raleigh-Durham', tz: 'America/New_York', country: 'US', lat: 35.8776, lng: -78.7875 },
  CLT: { city: 'Charlotte', tz: 'America/New_York', country: 'US', lat: 35.214, lng: -80.9431 },
  ATL: { city: 'Atlanta', tz: 'America/New_York', country: 'US', lat: 33.6407, lng: -84.4277 },
  JFK: { city: 'New York JFK', tz: 'America/New_York', country: 'US', lat: 40.6413, lng: -73.7781 },
  EWR: { city: 'Newark', tz: 'America/New_York', country: 'US', lat: 40.6895, lng: -74.1745 },
  LGA: { city: 'New York LaGuardia', tz: 'America/New_York', country: 'US', lat: 40.7769, lng: -73.874 },
  BOS: { city: 'Boston', tz: 'America/New_York', country: 'US', lat: 42.3656, lng: -71.0096 },
  PHL: { city: 'Philadelphia', tz: 'America/New_York', country: 'US', lat: 39.8744, lng: -75.2424 },
  IAD: { city: 'Washington Dulles', tz: 'America/New_York', country: 'US', lat: 38.9531, lng: -77.4565 },
  DCA: { city: 'Washington National', tz: 'America/New_York', country: 'US', lat: 38.8512, lng: -77.0402 },
  MIA: { city: 'Miami', tz: 'America/New_York', country: 'US', lat: 25.7959, lng: -80.287 },
  DTW: { city: 'Detroit', tz: 'America/Detroit', country: 'US', lat: 42.2162, lng: -83.3554 },
  ORD: { city: 'Chicago O’Hare', tz: 'America/Chicago', country: 'US', lat: 41.9742, lng: -87.9073 },
  DFW: { city: 'Dallas/Fort Worth', tz: 'America/Chicago', country: 'US', lat: 32.8998, lng: -97.0403 },
  MSP: { city: 'Minneapolis', tz: 'America/Chicago', country: 'US', lat: 44.8848, lng: -93.2223 },
  DEN: { city: 'Denver', tz: 'America/Denver', country: 'US', lat: 39.8561, lng: -104.6737 },
  SEA: { city: 'Seattle', tz: 'America/Los_Angeles', country: 'US', lat: 47.4502, lng: -122.3088 },
  SFO: { city: 'San Francisco', tz: 'America/Los_Angeles', country: 'US', lat: 37.6213, lng: -122.379 },
  LAX: { city: 'Los Angeles', tz: 'America/Los_Angeles', country: 'US', lat: 33.9416, lng: -118.4085 },
  YYZ: { city: 'Toronto', tz: 'America/Toronto', country: 'CA', lat: 43.6777, lng: -79.6248 },
  YUL: { city: 'Montréal', tz: 'America/Toronto', country: 'CA', lat: 45.4706, lng: -73.7408 },
  KEF: { city: 'Reykjavík', tz: 'Atlantic/Reykjavik', country: 'IS', lat: 63.985, lng: -22.6056 },
  DUB: { city: 'Dublin', tz: 'Europe/Dublin', country: 'IE', lat: 53.4264, lng: -6.2499 },
  LHR: { city: 'London Heathrow', tz: 'Europe/London', country: 'GB', lat: 51.47, lng: -0.4543 },
  LGW: { city: 'London Gatwick', tz: 'Europe/London', country: 'GB', lat: 51.1537, lng: -0.1821 },
  CDG: { city: 'Paris', tz: 'Europe/Paris', country: 'FR', lat: 49.0097, lng: 2.5479 },
  AMS: { city: 'Amsterdam', tz: 'Europe/Amsterdam', country: 'NL', lat: 52.3105, lng: 4.7683 },
  FRA: { city: 'Frankfurt', tz: 'Europe/Berlin', country: 'DE', lat: 50.0379, lng: 8.5622 },
  MUC: { city: 'Munich', tz: 'Europe/Berlin', country: 'DE', lat: 48.3537, lng: 11.775 },
  ZRH: { city: 'Zürich', tz: 'Europe/Zurich', country: 'CH', lat: 47.4582, lng: 8.5555 },
  MAD: { city: 'Madrid', tz: 'Europe/Madrid', country: 'ES', lat: 40.4983, lng: -3.5676 },
  FCO: { city: 'Rome', tz: 'Europe/Rome', country: 'IT', lat: 41.8003, lng: 12.2389 },
  CPH: { city: 'Copenhagen', tz: 'Europe/Copenhagen', country: 'DK', lat: 55.618, lng: 12.656 },
  ARN: { city: 'Stockholm', tz: 'Europe/Stockholm', country: 'SE', lat: 59.6498, lng: 17.9238 },
  OSL: { city: 'Oslo', tz: 'Europe/Oslo', country: 'NO', lat: 60.1976, lng: 11.1004 },
  HEL: { city: 'Helsinki', tz: 'Europe/Helsinki', country: 'FI', lat: 60.3172, lng: 24.9633 },
  TLL: { city: 'Tallinn', tz: 'Europe/Tallinn', country: 'EE', lat: 59.4133, lng: 24.8328 },
  IST: { city: 'Istanbul', tz: 'Europe/Istanbul', country: 'TR', lat: 41.2753, lng: 28.7519 },
  DOH: { city: 'Doha', tz: 'Asia/Qatar', country: 'QA', lat: 25.2731, lng: 51.6081 },
  DXB: { city: 'Dubai', tz: 'Asia/Dubai', country: 'AE', lat: 25.2532, lng: 55.3657 },
  NRT: { city: 'Tokyo Narita', tz: 'Asia/Tokyo', country: 'JP', lat: 35.772, lng: 140.3929 },
  HND: { city: 'Tokyo Haneda', tz: 'Asia/Tokyo', country: 'JP', lat: 35.5494, lng: 139.7798 },
}

/** Shortest connection we treat as comfortable, in minutes. */
export const MIN_CONNECTION = 60
/** Connections that cross a border usually need passport control. */
export const MIN_CONNECTION_INTL = 90
/** Layovers at least this long get called out as long. */
export const LONG_LAYOVER = 6 * 60

export const airport = (code: string): Airport | undefined => AIRPORTS[code.trim().toUpperCase()]

export const isFlight = (i: Item): i is Item & { legs: FlightLeg[] } => !!i.legs?.length

/** The timezone a leg's departure or arrival time is written in. */
export function legTz(leg: FlightLeg, end: 'depart' | 'arrive', fallbackTz: string): string {
  return leg[end].tz ?? airport(end === 'depart' ? leg.from : leg.to)?.tz ?? fallbackTz
}

export function legUtc(leg: FlightLeg, end: 'depart' | 'arrive', fallbackTz: string): number {
  return wallToUtc(legTz(leg, end, fallbackTz), leg[end].day, leg[end].time)
}

export const legMinutes = (leg: FlightLeg, tz: string) => Math.round((legUtc(leg, 'arrive', tz) - legUtc(leg, 'depart', tz)) / 60000)

export interface Layover {
  /** Index of the leg that lands here; the next leg is `after + 1`. */
  after: number
  /** Where you land. */
  at: string
  /** Where the next leg leaves from, if that's a different airport. */
  leaveFrom?: string
  minutes: number
  /** Crosses local midnight at the connecting airport. */
  overnight: boolean
  long: boolean
  /** Shorter than a comfortable connection (or negative). */
  tight: boolean
  /** Changes country, so the comfortable minimum is longer. */
  intl: boolean
}

function crossesBorder(leg: FlightLeg): boolean {
  const a = airport(leg.from)
  const b = airport(leg.to)
  return !!a && !!b && a.country !== b.country
}

export function layovers(legs: FlightLeg[], fallbackTz: string): Layover[] {
  const out: Layover[] = []
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = legs[i]
    const b = legs[i + 1]
    const minutes = Math.round((legUtc(b, 'depart', fallbackTz) - legUtc(a, 'arrive', fallbackTz)) / 60000)
    const tz = legTz(a, 'arrive', fallbackTz)
    const landed = utcToWall(tz, legUtc(a, 'arrive', fallbackTz))
    const leaves = utcToWall(tz, legUtc(b, 'depart', fallbackTz))
    const intl = crossesBorder(a) || crossesBorder(b)
    out.push({
      after: i,
      at: a.to.toUpperCase(),
      leaveFrom: b.from.toUpperCase() !== a.to.toUpperCase() ? b.from.toUpperCase() : undefined,
      minutes,
      overnight: leaves.day !== landed.day,
      long: minutes >= LONG_LAYOVER,
      tight: minutes < (intl ? MIN_CONNECTION_INTL : MIN_CONNECTION),
      intl,
    })
  }
  return out
}

/** Things worth flagging about a flight's legs. */
export function flightIssues(legs: FlightLeg[], fallbackTz: string): Issue[] {
  const out: Issue[] = []
  const add = (severity: Issue['severity'], message: string) => out.push({ kind: 'flight', severity, message })
  for (const leg of legs) {
    for (const [code, end] of [[leg.from, 'depart'], [leg.to, 'arrive']] as const) {
      if (code && !airport(code) && !leg[end].tz) add('info', `Not sure what time zone ${code.toUpperCase()} is in, so set it on the leg`)
    }
    if (legMinutes(leg, fallbackTz) <= 0) add('error', `${leg.from.toUpperCase()} → ${leg.to.toUpperCase()} lands before it takes off`)
  }
  for (const l of layovers(legs, fallbackTz)) {
    if (l.leaveFrom) add('warn', `Lands at ${l.at} but the next flight leaves from ${l.leaveFrom}`)
    if (l.minutes < 0) add('error', `The flight out of ${l.leaveFrom ?? l.at} leaves before you land`)
    else if (l.tight) add('warn', `Only ${fmtDuration(l.minutes)} to connect in ${l.at}${l.intl ? ' (with passport control)' : ''}`)
    else if (l.overnight) add('info', `Overnight layover in ${l.at}. Do you need a hotel?`)
    else if (l.long) add('info', `${fmtDuration(l.minutes)} layover in ${l.at}`)
  }
  return out
}

/** First takeoff to final landing, as wall minutes in the trip timezone. */
export function flightSpan(legs: FlightLeg[], tripTz: string): { day: string; start: number; end: number } {
  const dep = utcToWall(tripTz, legUtc(legs[0], 'depart', tripTz))
  const arrUtc = legUtc(legs[legs.length - 1], 'arrive', tripTz)
  const depUtc = legUtc(legs[0], 'depart', tripTz)
  return { day: dep.day, start: dep.min, end: dep.min + Math.max(0, Math.round((arrUtc - depUtc) / 60000)) }
}

/** Connecting airports, e.g. ["JFK"] for RDU → JFK → HEL. */
export const via = (legs: FlightLeg[]) => legs.slice(0, -1).map((l) => l.to.toUpperCase())

export const route = (legs: FlightLeg[]) => [legs[0].from, ...legs.map((l) => l.to)].map((c) => c.toUpperCase()).join(' → ')

export type FlightStatus =
  | { kind: 'before'; minutes: number }
  | { kind: 'leg'; leg: FlightLeg; index: number; minutesLeft: number }
  | { kind: 'layover'; layover: Layover; minutesLeft: number }
  | { kind: 'landed' }

/** Where you are in a flight at a given instant. */
export function flightStatus(legs: FlightLeg[], utcMs: number, fallbackTz: string): FlightStatus {
  const mins = (t: number) => Math.round((t - utcMs) / 60000)
  const first = legUtc(legs[0], 'depart', fallbackTz)
  if (utcMs < first) return { kind: 'before', minutes: mins(first) }
  const lays = layovers(legs, fallbackTz)
  for (let i = 0; i < legs.length; i++) {
    const arr = legUtc(legs[i], 'arrive', fallbackTz)
    if (utcMs < arr) return { kind: 'leg', leg: legs[i], index: i, minutesLeft: mins(arr) }
    const next = legs[i + 1]
    if (next) {
      const dep = legUtc(next, 'depart', fallbackTz)
      if (utcMs < dep) return { kind: 'layover', layover: lays[i], minutesLeft: mins(dep) }
    }
  }
  return { kind: 'landed' }
}

const LEG_ANCHOR = 'leg:'

export const isLegAnchor = (a: Anchor) => a.id.startsWith(LEG_ANCHOR)

/**
 * The item fields that follow from its legs: "Departs"/"Lands" anchors (so
 * cards, Now and reflow keep working off anchors), the duration, and the
 * departure airport as its location.
 */
export function applyLegs(item: Item, legs: FlightLeg[], tripTz: string): Partial<Item> {
  const own = item.anchors.filter((a) => !isLegAnchor(a))
  if (!legs.length) return { legs: undefined, anchors: own }
  const first = legs[0]
  const last = legs[legs.length - 1]
  const anchors: Anchor[] = [
    { id: `${LEG_ANCHOR}dep`, label: 'Departs', day: first.depart.day, time: first.depart.time, hard: true, tz: legTz(first, 'depart', tripTz) },
    { id: `${LEG_ANCHOR}arr`, label: 'Arrives', day: last.arrive.day, time: last.arrive.time, hard: false, tz: legTz(last, 'arrive', tripTz) },
  ]
  const { start, end } = flightSpan(legs, tripTz)
  const total = end - start
  const from = airport(first.from)
  return {
    legs,
    anchors: [...own, ...anchors],
    // The card's big route reads these, so it shows the whole trip.
    details: { ...item.details, from: first.from.toUpperCase(), to: last.to.toUpperCase() },
    duration: { min: total, typical: total, max: total },
    ...(from ? { location: { lat: from.lat, lng: from.lng } } : {}),
  }
}

/** Where you end up after this item: the final airport for a flight. */
export function endLocation(item: Item): LatLng | undefined {
  if (isFlight(item)) {
    const a = airport(item.legs[item.legs.length - 1].to)
    if (a) return { lat: a.lat, lng: a.lng }
  }
  return item.location
}

/**
 * The first leg of a flight that so far only has the card's single-flight
 * fields filled in, so adding a connection keeps what was already entered.
 */
export function legFromCard(item: Item, fallbackDay: string): FlightLeg {
  const d = (id: string) => item.details?.[id]?.trim() || undefined
  const dep = item.anchors.find((a) => /depart/i.test(a.label)) ?? item.anchors.find((a) => a.hard)
  const arr = item.anchors.find((a) => /arriv|land/i.test(a.label))
  const depart = dep ? { day: dep.day, time: dep.time, tz: dep.tz } : { day: fallbackDay, time: 9 * 60 }
  const arrive = arr ? { day: arr.day, time: arr.time, tz: arr.tz } : { day: depart.day, time: Math.min(depart.time + 120, 1439) }
  return {
    id: `leg-${item.id}-1`,
    from: d('from') ?? '',
    to: d('to') ?? '',
    flightNo: [d('airline'), d('flight')].filter(Boolean).join(' ') || undefined,
    depart,
    arrive,
    seat: d('seat'),
    confirmation: d('conf'),
  }
}

/** Card fields that move onto each leg once a flight has connections. */
export const PER_LEG_FIELDS = ['from', 'to', 'airline', 'flight', 'seat', 'conf']
