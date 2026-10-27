import type { LatLng, TransitMode } from '../types'
import { utcToWall, wallToUtc } from './time'
import { distanceMeters } from './transit'

// Real routes from free, keyless-or-free-key services that allow calls from
// the browser (the app is a static site with no server of its own):
//   walk / drive  OSRM on routing.openstreetmap.de (FOSSGIS)
//   transit       HSL Digitransit inside the Helsinki region when a key is
//                 configured, otherwise Transitous (community-run, worldwide)
// Anything that fails falls back to the distance estimate in transit.ts.

export type RouteSource = 'hsl' | 'transitous' | 'osm'

export interface Route {
  minutes: number
  meters?: number
  /** Transit only: the lines to take, e.g. "Tram 4 → Bus 23". */
  line?: string
  /** Transit only: when to leave (wall minutes on the arrival day, trip timezone). */
  leave?: number
  source: RouteSource
  fetchedAt: number
}

export interface RouteRequest {
  key: string
  from: LatLng
  to: LatLng
  mode: TransitMode
  /** Transit is timetable-based: arrive by this wall time. */
  day?: string
  arriveBy?: number
  timezone?: string
}

/** Below this, the hop is "you're already there". Above it, it isn't a city leg. */
export const MIN_ROUTE_METERS = 50
export const MAX_ROUTE_METERS = 100_000

const ll = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

export function routeKey(from: LatLng, to: LatLng, mode: TransitMode, day?: string, arriveBy?: number): string {
  const base = `${mode}|${ll(from)}|${ll(to)}`
  return mode === 'transit' ? `${base}|${day}|${arriveBy}` : base
}

export function routable(from: LatLng, to: LatLng): boolean {
  const m = distanceMeters(from, to)
  return m >= MIN_ROUTE_METERS && m <= MAX_ROUTE_METERS
}

/** Timetables change and walking paths don't. */
export function isStale(r: Route, now = Date.now()): boolean {
  const days = r.line != null || r.leave != null ? 3 : 30
  return now - r.fetchedAt > days * 86_400_000
}

// --- Fetching -------------------------------------------------------------

const DIGITRANSIT_KEY: string | undefined = import.meta.env.VITE_DIGITRANSIT_KEY
// HSL's zone, roughly Kirkkonummi to Sipoo and up to Kerava.
const HSL_AREA = { s: 59.95, n: 60.45, w: 24.3, e: 25.4 }
const inHsl = (p: LatLng) => p.lat > HSL_AREA.s && p.lat < HSL_AREA.n && p.lng > HSL_AREA.w && p.lng < HSL_AREA.e

// Finding and boarding a taxi, which OSRM's door-to-door time leaves out.
const TAXI_OVERHEAD = 5

export async function fetchRoute(req: RouteRequest, signal?: AbortSignal): Promise<Route | null> {
  if (req.mode === 'transit') {
    if (DIGITRANSIT_KEY && inHsl(req.from) && inHsl(req.to)) return fetchDigitransit(req, DIGITRANSIT_KEY, signal)
    return fetchTransitous(req, signal)
  }
  return fetchOsrm(req, signal)
}

async function json(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return res.json()
}

async function fetchOsrm(req: RouteRequest, signal?: AbortSignal): Promise<Route | null> {
  const profile = req.mode === 'walk' ? 'routed-foot' : 'routed-car'
  const coords = `${req.from.lng},${req.from.lat};${req.to.lng},${req.to.lat}`
  const data = await json(`https://routing.openstreetmap.de/${profile}/route/v1/driving/${coords}?overview=false`, { signal })
  return parseOsrm(data, req.mode)
}

export function parseOsrm(data: any, mode: TransitMode): Route | null {
  const r = data?.code === 'Ok' ? data.routes?.[0] : undefined
  if (!r) return null
  const overhead = mode === 'drive' ? TAXI_OVERHEAD : 0
  return { minutes: Math.max(1, Math.round(r.duration / 60) + overhead), meters: Math.round(r.distance), source: 'osm', fetchedAt: Date.now() }
}

function arriveByIso(req: RouteRequest): string {
  return new Date(wallToUtc(req.timezone!, req.day!, req.arriveBy!)).toISOString()
}

async function fetchTransitous(req: RouteRequest, signal?: AbortSignal): Promise<Route | null> {
  const p = new URLSearchParams({
    fromPlace: `${req.from.lat},${req.from.lng}`,
    toPlace: `${req.to.lat},${req.to.lng}`,
    time: arriveByIso(req),
    arriveBy: 'true',
    numItineraries: '1',
    maxItineraries: '3',
    detailedTransfers: 'false',
  })
  const data = await json(`https://api.transitous.org/api/v5/plan?${p}`, { signal })
  return parseTransitous(data, req)
}

export function parseTransitous(data: any, req: RouteRequest): Route | null {
  // Several options come back; leave as late as possible while still arriving in time.
  const by = Date.parse(arriveByIso(req))
  const its: any[] = (data?.itineraries ?? []).filter((i: any) => Date.parse(i.endTime) <= by)
  const it = its.sort((x, y) => Date.parse(y.startTime) - Date.parse(x.startTime))[0]
  if (!it) return null
  const lines = (it.legs ?? []).filter((l: any) => !STREET.has(l.mode)).map((l: any) => lineName(l.mode, l.routeShortName || l.displayName))
  // Transitous only gives distances for the walking parts, so leave meters to the map.
  return transitRoute(it.startTime, it.duration, undefined, lines, 'transitous', req)
}

const PLAN_QUERY = `query($from: PlanCoordinateInput!, $to: PlanCoordinateInput!, $at: OffsetDateTime!) {
  planConnection(origin: { location: { coordinate: $from } }, destination: { location: { coordinate: $to } },
    dateTime: { latestArrival: $at }, first: 3) {
    edges { node { start duration legs { mode distance route { shortName } } } }
  }
}`

async function fetchDigitransit(req: RouteRequest, key: string, signal?: AbortSignal): Promise<Route | null> {
  const coord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng })
  const data = await json('https://api.digitransit.fi/routing/v2/hsl/gtfs/v1', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'digitransit-subscription-key': key },
    body: JSON.stringify({ query: PLAN_QUERY, variables: { from: coord(req.from), to: coord(req.to), at: arriveByIso(req) } }),
  })
  return parseDigitransit(data, req)
}

export function parseDigitransit(data: any, req: RouteRequest): Route | null {
  const nodes: any[] = (data?.data?.planConnection?.edges ?? []).map((e: any) => e.node).filter(Boolean)
  // Leave as late as possible: the itinerary with the latest start.
  const it = nodes.sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0]
  if (!it) return null
  const lines = (it.legs ?? []).filter((l: any) => !STREET.has(l.mode)).map((l: any) => lineName(l.mode, l.route?.shortName))
  return transitRoute(it.start, it.duration, sumDistance(it.legs), lines, 'hsl', req)
}

const STREET = new Set(['WALK', 'BICYCLE', 'BIKE', 'CAR', 'SCOOTER'])

const MODE_WORD: Record<string, string> = {
  TRAM: 'Tram',
  BUS: 'Bus',
  COACH: 'Bus',
  SUBWAY: 'Metro',
  METRO: 'Metro',
  RAIL: 'Train',
  SUBURBAN: 'Train',
  REGIONAL_RAIL: 'Train',
  LONG_DISTANCE: 'Train',
  HIGHSPEED_RAIL: 'Train',
  FERRY: 'Ferry',
}

export function lineName(mode: string, short?: string): string {
  const word = MODE_WORD[mode] ?? 'Line'
  if (!short) return word
  // HSL metro lines are already "M1"/"M2"; don't say "Metro M1".
  return word === 'Metro' && /^M\d/.test(short) ? short : `${word} ${short}`
}

const sumDistance = (legs: any[] = []) => Math.round(legs.reduce((s, l) => s + (l.distance ?? 0), 0)) || undefined

function transitRoute(start: string, durationSec: number, meters: number | undefined, lines: string[], source: RouteSource, req: RouteRequest): Route {
  const wall = utcToWall(req.timezone!, Date.parse(start))
  return {
    minutes: Math.max(1, Math.round(durationSec / 60)),
    meters,
    line: lines.length ? lines.slice(0, 2).join(' → ') + (lines.length > 2 ? ' …' : '') : undefined,
    leave: wall.min + dayDiff(req.day!, wall.day) * 1440,
    source,
    fetchedAt: Date.now(),
  }
}

/** Whole days from `a` to `b` (ISO dates). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

// --- Live departures --------------------------------------------------------

/** One way to make a transit leg, with live delay when the operator shares it. */
export interface Departure {
  /** When to set off (wall minutes on `day`), including the walk to the stop. */
  leave: number
  /** When the first vehicle actually departs. */
  depart: number
  arrive: number
  line?: string
  /** Minutes behind schedule for the first vehicle (negative = early). */
  delay: number
  realTime: boolean
}

export interface DepartureQuery {
  from: LatLng
  to: LatLng
  day: string
  /** Departures leaving at or after this wall time. */
  after: number
  /** How far ahead to look, in minutes. */
  window: number
  timezone: string
}

export async function fetchDepartures(q: DepartureQuery, signal?: AbortSignal): Promise<Departure[]> {
  const p = new URLSearchParams({
    fromPlace: `${q.from.lat},${q.from.lng}`,
    toPlace: `${q.to.lat},${q.to.lng}`,
    time: new Date(wallToUtc(q.timezone, q.day, q.after)).toISOString(),
    searchWindow: String(Math.round(Math.min(120, Math.max(15, q.window)) * 60)),
    numItineraries: '4',
    maxItineraries: '6',
    detailedTransfers: 'false',
  })
  const data = await json(`https://api.transitous.org/api/v5/plan?${p}`, { signal })
  return parseDepartures(data, q.day, q.timezone)
}

export function parseDepartures(data: any, day: string, timezone: string): Departure[] {
  const wall = (iso: string) => {
    const w = utcToWall(timezone, Date.parse(iso))
    return w.min + dayDiff(day, w.day) * 1440
  }
  const out: Departure[] = []
  for (const it of data?.itineraries ?? []) {
    const rides = (it.legs ?? []).filter((l: any) => !STREET.has(l.mode))
    const first = rides[0]
    if (!first) continue
    const lines = rides.map((l: any) => lineName(l.mode, l.routeShortName || l.displayName))
    out.push({
      leave: wall(it.startTime),
      depart: wall(first.startTime),
      arrive: wall(it.endTime),
      line: lines.slice(0, 2).join(' → ') + (lines.length > 2 ? ' …' : ''),
      delay: first.scheduledStartTime ? Math.round((Date.parse(first.startTime) - Date.parse(first.scheduledStartTime)) / 60000) : 0,
      realTime: rides.some((l: any) => l.realTime),
    })
  }
  // One row per departure, earliest first.
  const seen = new Set<string>()
  return out
    .sort((a, b) => a.depart - b.depart || a.arrive - b.arrive)
    .filter((d) => {
      const k = `${d.depart}|${d.line}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** The latest departure that still arrives in time, else the soonest one. */
export function bestDeparture(deps: Departure[], arriveBy: number): Departure | undefined {
  const ok = deps.filter((d) => d.arrive <= arriveBy)
  return ok.length ? ok.reduce((a, b) => (b.leave > a.leave ? b : a)) : deps[0]
}

export function delayText(d: Departure): string {
  if (!d.realTime) return 'scheduled'
  if (d.delay >= 1) return `${d.delay} min late`
  if (d.delay <= -1) return `${-d.delay} min early`
  return 'on time'
}
