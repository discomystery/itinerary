import type { Anchor, CardKind, Item, ItemType, Trip } from '../types'
import { anchorInTrip } from './schedule'
import { addDays, dayRange } from './time'

// Which paper object each item is drawn as, the styles within each kind, and
// the fields each one carries. Rendering lives in components/objects.tsx.

const has = (i: Item, ...tags: string[]) => tags.some((t) => i.tags.includes(t))

export interface KindInfo {
  label: string
  /** The scheduling type an item of this kind gets. */
  type: ItemType
  variants?: { id: string; label: string }[]
  /** Labels offered when adding a time. */
  times?: string[]
  /** Runs across several days (stays, rentals, passes). */
  spans?: boolean
}

export const KINDS: Record<CardKind, KindInfo> = {
  post: { label: 'Place', type: 'place' },
  map: { label: 'Area', type: 'area' },
  ticket: { label: 'Ticket', type: 'event', variants: [{ id: 'event', label: 'Event' }, { id: 'timed', label: 'Timed entry' }], times: ['Doors', 'Starts', 'Entry'] },
  voucher: { label: 'Tour voucher', type: 'event', times: ['Meet', 'Ends'] },
  resv: { label: 'Reservation', type: 'reservation', times: ['Reserved'] },
  pass: {
    label: 'Boarding pass',
    type: 'transport',
    variants: [{ id: 'flight', label: 'Flight' }, { id: 'train', label: 'Train' }, { id: 'ferry', label: 'Ferry' }, { id: 'coach', label: 'Coach' }],
    times: ['Departs', 'Arrives', 'Check-in closes', 'Boarding'],
  },
  fare: { label: 'Transit fare', type: 'transport', variants: [{ id: 'single', label: 'Single ride' }, { id: 'day', label: 'Day pass' }], times: ['Starts', 'Valid until'], spans: true },
  xfer: { label: 'Transfer', type: 'transport', times: ['Pickup'] },
  key: { label: 'Hotel key', type: 'reservation', times: ['Check in', 'Check out'], spans: true },
  tag: { label: 'Rental key tag', type: 'reservation', variants: [{ id: 'rental', label: 'Rental' }, { id: 'hostel', label: 'Hostel' }], times: ['Check in', 'Check out'], spans: true },
  car: { label: 'Rental car', type: 'reservation', times: ['Pick up', 'Return'], spans: true },
  cpass: { label: 'City pass', type: 'reservation', times: ['Starts', 'Expires'], spans: true },
  note: { label: 'Sticky note', type: 'note' },
}

export const KIND_ORDER: CardKind[] = ['post', 'map', 'ticket', 'voucher', 'resv', 'pass', 'fare', 'xfer', 'key', 'tag', 'car', 'cpass', 'note']

export function cardKind(i: Item): CardKind {
  if (i.card) return i.card
  switch (i.type) {
    case 'event':
      return has(i, 'tour') ? 'voucher' : 'ticket'
    case 'transport':
      if (has(i, 'transfer')) return 'xfer'
      return has(i, 'flight', 'ferry-trip', 'long-train', 'coach') || /\bflight\b/i.test(i.title) ? 'pass' : 'fare'
    case 'reservation':
      if (has(i, 'rental', 'airbnb', 'hostel')) return 'tag'
      if (has(i, 'lodging', 'hotel')) return 'key'
      if (has(i, 'car')) return 'car'
      if (has(i, 'citypass')) return 'cpass'
      return 'resv'
    case 'area':
      return 'map'
    case 'note':
      return 'note'
    default:
      return 'post'
  }
}

export function variantOf(i: Item): string | undefined {
  const k = cardKind(i)
  const vs = KINDS[k].variants
  if (!vs) return undefined
  if (i.variant && vs.some((v) => v.id === i.variant)) return i.variant
  if (k === 'pass') return has(i, 'ferry-trip') ? 'ferry' : has(i, 'long-train') ? 'train' : has(i, 'coach') ? 'coach' : 'flight'
  if (k === 'fare') return has(i, 'daypass') ? 'day' : 'single'
  if (k === 'tag') return has(i, 'hostel') ? 'hostel' : 'rental'
  return vs[0].id
}

export interface Field {
  id: string
  label: string
  ph?: string
  wide?: boolean
  multi?: boolean
}

const f = (id: string, label: string, ph?: string, more?: Partial<Field>): Field => ({ id, label, ph, ...more })

/** The details each kind asks for, in the order they print on the card. */
export function fieldsFor(kind: CardKind, variant?: string): Field[] {
  switch (kind) {
    case 'ticket':
      return variant === 'timed'
        ? [f('tickets', 'Tickets', '2'), f('ref', 'Booking ref')]
        : [f('section', 'Section'), f('row', 'Row'), f('seat', 'Seat'), f('tickets', 'Tickets', '2')]
    case 'pass':
      if (variant === 'train') return [f('from', 'From code', 'HKI'), f('to', 'To code', 'TPE'), f('train', 'Train'), f('platform', 'Platform'), f('coach', 'Coach'), f('seat', 'Seat'), f('class', 'Class'), f('ticket', 'Ticket no.')]
      if (variant === 'ferry') return [f('from', 'From port', 'Helsinki'), f('to', 'To port', 'Tallinn'), f('terminal', 'Terminal'), f('deck', 'Deck'), f('cabin', 'Cabin'), f('vehicle', 'Vehicle', 'On foot'), f('booking', 'Booking')]
      if (variant === 'coach') return [f('from', 'From', 'Kamppi'), f('to', 'To', 'Turku'), f('bay', 'Bay'), f('seat', 'Seat'), f('operator', 'Operator'), f('booking', 'Booking')]
      return [f('from', 'From code', 'RDU'), f('to', 'To code', 'HEL'), f('airline', 'Airline'), f('flight', 'Flight'), f('gate', 'Gate'), f('seat', 'Seat'), f('terminal', 'Terminal'), f('conf', 'Confirmation')]
    case 'fare':
      return variant === 'day'
        ? [f('zones', 'Zones', 'AB'), f('length', 'Length', '72h'), f('covers', 'Covers', 'Trams, metro, buses, ferry', { wide: true })]
        : [f('zones', 'Zones', 'ABC'), f('stops', 'Stops (one per line)', 'Helsinki Airport\nPasila\nHelsinki Central', { wide: true, multi: true })]
    case 'xfer':
      return [f('driver', 'Driver'), f('phone', 'Phone'), f('booking', 'Booking'), f('sign', 'Name on the sign', 'Me +1')]
    case 'resv':
      return [f('party', 'Party', '2'), f('name', 'Name'), f('conf', 'Confirmation')]
    case 'key':
      return [f('room', 'Room'), f('code', 'Door code'), f('wifi', 'Wifi'), f('conf', 'Confirmation')]
    case 'tag':
      return variant === 'hostel'
        ? [f('dorm', 'Dorm'), f('bed', 'Bed'), f('code', 'Door code'), f('wifi', 'Wifi')]
        : [f('steps', 'Getting in (one step per line)', 'Lockbox left of the street door\nStairs B, 3rd floor', { wide: true, multi: true }), f('code', 'Door or lockbox code'), f('host', 'Host'), f('wifi', 'Wifi')]
    case 'car':
      return [f('returnAt', 'Return to', 'City centre office', { wide: true }), f('plate', 'Plate'), f('bay', 'Bay'), f('fuel', 'Fuel', 'Full to full'), f('agreement', 'Agreement'), f('cover', 'Cover'), f('drivers', 'Drivers', '2')]
    case 'voucher':
      return [f('meet', 'Meeting point', 'Esplanadi Park bandstand', { wide: true }), f('look', 'How to find them', 'Guide with a yellow umbrella', { wide: true }), f('operator', 'Operator'), f('code', 'Voucher code')]
    case 'cpass':
      return [f('length', 'Length', '48h'), f('code', 'Card number')]
    default:
      return []
  }
}

/** Field value, or undefined when blank. */
export const det = (i: Item, id: string) => i.details?.[id]?.trim() || undefined

/* ------------------------------ Spanning ------------------------------- */

export interface Span {
  from: { day: string; min: number; anchor: Anchor }
  to: { day: string; min: number; anchor: Anchor }
  /** Whole days: the times don't matter. */
  allDay?: boolean
}

/**
 * Does start → end run over several days? Stays and rentals do from one night;
 * anything else needs to go past 6am the next day, so a late night out stays one plan.
 */
export function spansDays(i: Item, fromDay: string, toDay: string, toMin: number) {
  if (toDay <= fromDay) return false
  return !!KINDS[cardKind(i)].spans || toDay > addDays(fromDay, 1) || toMin > 6 * 60
}

/** Stays, rentals, passes, and anything set to run over several days, from their first time to their last. */
export function spanOf(i: Item, tz: string): Span | null {
  const k = cardKind(i)
  if (k === 'pass' || (k === 'fare' && variantOf(i) !== 'day') || !i.anchors.length) return null
  const pts = i.anchors.map((a) => ({ ...anchorInTrip(a, tz), anchor: a })).sort((a, b) => a.day.localeCompare(b.day) || a.min - b.min)
  const from = pts[0]
  const to = pts[pts.length - 1]
  if (i.allDay) return { from, to, allDay: true }
  if (!spansDays(i, from.day, to.day, to.min)) return null
  return { from, to }
}

export interface Ribbon {
  item: Item
  text: string
  /** Pips for stays: how many nights, and how many have started. */
  pips?: { on: number; total: number }
}

const wd = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })

/** Slim reminders for everything still running on a day it has no plan block. */
export function ribbonsFor(trip: Trip, day: string, clock: (m: number) => string): Ribbon[] {
  const out: Ribbon[] = []
  for (const i of trip.items) {
    if (i.inbox) continue
    const s = spanOf(i, trip.timezone)
    if (!s || day < s.from.day || day > s.to.day) continue
    if (trip.blocks.some((b) => b.itemId === i.id && b.day === day)) continue
    const k = cardKind(i)
    const days = dayRange(s.from.day, s.to.day)
    const n = days.indexOf(day)
    const first = n === 0
    const last = day === s.to.day
    const at = (x: Span['from']) => `${x.anchor.label} ${clock(x.min)}`
    if (s.allDay) {
      out.push({ item: i, text: days.length > 1 ? `Day ${n + 1} of ${days.length}` : 'All day' })
    } else if (k === 'key' || k === 'tag') {
      const nights = days.length - 1
      const text = first ? at(s.from) : last ? at(s.to) : `Night ${n + 1} of ${nights}`
      out.push({ item: i, text, pips: { on: Math.min(n + 1, nights), total: nights } })
    } else if (k === 'car') {
      out.push({ item: i, text: first ? at(s.from) : last ? at(s.to) : `Day ${n + 1} of ${days.length} · back ${wd(s.to.day)}` })
    } else {
      out.push({ item: i, text: first ? `${at(s.from)}` : last ? `Until ${clock(s.to.min)}` : `Until ${wd(s.to.day)} ${clock(s.to.min)}` })
    }
  }
  return out
}

/** Ideas a city pass covers, so their cards can carry a PASS mark. */
export function coveredByPass(trip: Trip): Set<string> {
  const out = new Set<string>()
  for (const i of trip.items) {
    if (cardKind(i) !== 'cpass') continue
    for (const id of (i.details?.covers ?? '').split(',')) if (id) out.add(id)
  }
  return out
}
