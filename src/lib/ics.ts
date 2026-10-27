import type { Block, Item, Trip } from '../types'
import { cardKind, det, fieldsFor, variantOf } from './cards'
import { fmtTime, wallToUtc } from './time'

// Calendar export: one VEVENT per scheduled plan, in UTC so every calendar app
// places it right whatever timezone the phone is in.

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold lines at 75 octets, continuing with a leading space. */
export function fold(line: string): string {
  const bytes = new TextEncoder()
  if (bytes.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    const limit = out.length ? 74 : 75
    if (bytes.encode(cur + ch).length > limit) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** "RDU→JFK AA 4421, 7:05a–9:10a, seat 12A, conf ABC123" for each flight leg. */
export function flightLegLines(item: Item): string[] {
  return (item.legs ?? []).map((l) =>
    [`${l.from}→${l.to}${l.flightNo ? ` ${l.flightNo}` : ''}`, `${fmtTime(l.depart.time)}–${fmtTime(l.arrive.time)}`, l.seat && `seat ${l.seat}`, l.confirmation && `conf ${l.confirmation}`]
      .filter(Boolean)
      .join(', '),
  )
}

export function blockEvent(trip: Trip, b: Block, now = Date.now()): string[] {
  const item = trip.items.find((i) => i.id === b.itemId)
  if (!item) return []
  const fields = fieldsFor(cardKind(item), variantOf(item))
    .map((f) => [f.label, det(item, f.id)] as const)
    .filter((x): x is readonly [string, string] => !!x[1])
    .map(([k, v]) => `${k}: ${v.replace(/\n/g, ', ')}`)
  const desc = [...flightLegLines(item), ...fields, item.notes, item.tbd && `Still needs: ${item.tbd}`, item.url].filter(Boolean).join('\n')
  const lines = [
    'BEGIN:VEVENT',
    `UID:${b.id}.${trip.id}@papermap`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(wallToUtc(trip.timezone, b.day, b.start))}`,
    `DTEND:${stamp(wallToUtc(trip.timezone, b.day, b.end))}`,
    `SUMMARY:${esc(item.title)}`,
  ]
  const where = item.address ?? (item.location ? item.title : undefined)
  if (where) lines.push(`LOCATION:${esc(where)}`)
  if (item.location) lines.push(`GEO:${item.location.lat.toFixed(6)};${item.location.lng.toFixed(6)}`)
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
  if (item.url) lines.push(`URL:${item.url}`)
  lines.push('END:VEVENT')
  return lines
}

/** An .ics calendar for the given plans (the whole trip by default). */
export function tripCalendar(trip: Trip, blocks: Block[] = trip.blocks, now = Date.now()): string {
  const events = [...blocks]
    .sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
    .flatMap((b) => blockEvent(trip, b, now))
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Papermap//Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(trip.name)}`,
    ...events,
    'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n'
}

export function downloadCalendar(trip: Trip, blocks?: Block[], name = trip.name) {
  const blob = new Blob([tripCalendar(trip, blocks)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
