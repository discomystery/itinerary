import type { Audience, Block, Id, Item, Person, Track, Trip } from '../types'
import { isFlight, legUtc } from './flights'
import { utcToWall } from './time'

// Tracks: parts of the group following their own itinerary for a while, like
// people flying in on different days. A card (or one time on the plan) can be
// for a track, a few people, or everyone. Each person's itinerary is the trip
// seen through `forPerson`.

export const TRACK_COLORS = ['#0f766e', '#b45309', '#6d28d9', '#be123c', '#1d4ed8', '#4d7c0f']

export const tracksOf = (trip: Trip): Track[] => trip.tracks ?? []

export const trackById = (trip: Trip, id?: Id) => (id ? tracksOf(trip).find((t) => t.id === id) : undefined)

const set = (a?: Audience) => !!a && (!!a.track || !!a.who?.length)

/** The people an audience names, or null for the whole group. A track nobody's in yet is the whole group too. */
export function members(trip: Trip, a?: Audience): Id[] | null {
  if (!a) return null
  if (a.track) {
    const t = trackById(trip, a.track)
    return t?.people.length ? t.people : null
  }
  return a.who?.length ? a.who : null
}

/** Where a plan's audience comes from: its own (a repeat with different people), else its card's. */
export function audienceSource(item: Item | undefined, block?: Block): Audience | undefined {
  if (set(block)) return block
  return set(item) ? item : undefined
}

/** Who a card, or one time it's on the plan, is for. Null means everyone. */
export function audience(trip: Trip, item: Item | undefined, block?: Block): Id[] | null {
  return members(trip, audienceSource(item, block))
}

export const isFor = (trip: Trip, person: Id, item: Item | undefined, block?: Block) => {
  const a = audience(trip, item, block)
  return !a || a.includes(person)
}

/** Two plans can't clash unless someone is on both. */
export function sharePeople(a: Id[] | null, b: Id[] | null): boolean {
  if (!a || !b) return true
  return a.some((p) => b.includes(p))
}

/** Does anything on the trip apply to only part of the group? */
export function hasSplits(trip: Trip): boolean {
  return trip.items.some(set) || trip.blocks.some(set)
}

/** One person's itinerary: only the cards and plans they're on. */
export function forPerson(trip: Trip, person: Id): Trip {
  const byId = new Map(trip.items.map((i) => [i.id, i]))
  const blocks = trip.blocks.filter((b) => isFor(trip, person, byId.get(b.itemId), b))
  const onPlan = new Set(blocks.map((b) => b.itemId))
  const items = trip.items.filter((i) => onPlan.has(i.id) || isFor(trip, person, i))
  return { ...trip, blocks, items }
}

export interface AudienceLabel {
  /** "Raleigh crew", "Me & Friend", "Friend". */
  name: string
  color?: string
  people: Person[]
  track?: Track
}

/** How to name who a card is for, or null when it's everyone. */
export function audienceLabel(trip: Trip, item: Item | undefined, block?: Block): AudienceLabel | null {
  const src = audienceSource(item, block)
  const ids = members(trip, src)
  if (!ids) return null
  const people = trip.people.filter((p) => ids.includes(p.id))
  const track = trackById(trip, src?.track)
  if (track) return { name: track.name, color: track.color, people, track }
  const names = people.map((p) => p.name)
  const name = names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
  return { name, people }
}

/** The tracks someone is in. */
export const tracksFor = (trip: Trip, person: Id) => tracksOf(trip).filter((t) => t.people.includes(person))

export interface Travel {
  /** When they land at the trip's end of their first flight, in trip time. */
  arrive?: { day: string; min: number; title: string }
  /** When their last flight takes off. */
  leave?: { day: string; min: number; title: string }
}

/** Someone's first landing and last take-off, from the flights they're on. */
export function travelFor(trip: Trip, person: Id): Travel {
  const flights = trip.items
    .filter((i) => !i.inbox && isFlight(i) && isFor(trip, person, i))
    .map((i) => ({ i, dep: legUtc(i.legs![0], 'depart', trip.timezone), arr: legUtc(i.legs![i.legs!.length - 1], 'arrive', trip.timezone) }))
    .filter((f) => Number.isFinite(f.dep) && Number.isFinite(f.arr))
    .sort((a, b) => a.dep - b.dep)
  if (!flights.length) return {}
  const wall = (ms: number) => {
    const w = utcToWall(trip.timezone, ms)
    return { day: w.day, min: w.min }
  }
  // Flights landing in the first half of the trip get you there; ones taking off in the second half take you home.
  const mid = (Date.parse(trip.startDay) + Date.parse(trip.endDay) + 86400000) / 2
  const inbound = flights.filter((f) => Date.parse(wall(f.arr).day) < mid)
  const outbound = flights.filter((f) => Date.parse(wall(f.dep).day) >= mid)
  const out: Travel = {}
  const first = inbound[inbound.length - 1]
  const last = outbound[0]
  if (first) out.arrive = { ...wall(first.arr), title: first.i.title }
  if (last) out.leave = { ...wall(last.dep), title: last.i.title }
  return out
}

/** Change who's in a track, keeping cards for it pointed at it. */
export function withTrack(trip: Trip, track: Track): Trip {
  const tracks = tracksOf(trip)
  return { ...trip, tracks: tracks.some((t) => t.id === track.id) ? tracks.map((t) => (t.id === track.id ? track : t)) : [...tracks, track] }
}

/** Delete a track. Its cards go back to everyone. */
export function withoutTrack(trip: Trip, id: Id): Trip {
  const clear = <T extends Audience>(x: T): T => (x.track === id ? { ...x, track: undefined } : x)
  return { ...trip, tracks: tracksOf(trip).filter((t) => t.id !== id), items: trip.items.map(clear), blocks: trip.blocks.map(clear) }
}
