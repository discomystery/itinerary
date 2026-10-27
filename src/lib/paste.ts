import type { ItemType, LatLng } from '../types'

// Turn whatever someone pasted (a friend's text, notes, a blog list, Google
// Maps links) into rough ideas. Each line is one idea; anything we can't
// understand stays in the title or notes for a human to fix during review.

export interface ParsedLine {
  raw: string
  title: string
  notes?: string
  url?: string
  tags: string[]
  type: ItemType
  /** Weekday the person mentioned, 0 = Sunday. */
  weekday?: number
  /** Coordinates taken straight from a Google Maps link. */
  location?: LatLng
}

const BULLET = /^\s*(?:[-*•·▪◦‣>]+|\d{1,3}[.)]|\[[ x]\])\s+/i
const URL_RE = /https?:\/\/[^\s<>()]+/i
const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu

// Word matching that understands accented letters ("café", "Löyly").
const words = (...w: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${w.join('|')})(?![\\p{L}\\p{N}])`, 'iu')

const WEEKDAYS: [RegExp, number][] = [
  [words('sun', 'sunday'), 0],
  [words('mon', 'monday'), 1],
  [words('tue', 'tues', 'tuesday'), 2],
  [words('wed', 'wednesday'), 3],
  [words('thu', 'thur', 'thurs', 'thursday'), 4],
  [words('fri', 'friday'), 5],
  [words('sat', 'saturday'), 6],
]
const LEADING_DAY = /^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?\s*[:,–—-]\s*/i

// Words that hint at what kind of thing this is.
const HINTS: [RegExp, { tag?: string; type?: ItemType }][] = [
  [words('breakfast', 'brunch', 'lunch', 'dinner', 'restaurant', 'café', 'cafe', 'coffee', 'bakery', 'food', 'eat', 'market hall'), { tag: 'food' }],
  [words('bar', 'bars', 'pub', 'brewery', 'cocktails?', 'wine', 'club', 'nightlife'), { tag: 'nightlife' }],
  [words('sauna', 'spa', 'baths?', 'pool'), { tag: 'sauna' }],
  [words('museum', 'gallery', 'exhibit', 'exhibition', 'art'), { tag: 'museum' }],
  [words('church', 'cathedral', 'monument', 'fortress', 'castle', 'palace', 'square'), { tag: 'sights' }],
  [words('park', 'island', 'hike', 'beach', 'forest', 'garden', 'outdoors?'), { tag: 'outdoors' }],
  [words('shop', 'shopping', 'store', 'boutique', 'vintage', 'flea market', 'market'), { tag: 'shopping' }],
  [words('neighbou?rhood', 'district', 'area', 'wander', 'stroll', 'walk around'), { type: 'area' }],
  [words('tickets?', 'concert', 'game', 'show', 'gig', 'match', 'festival'), { type: 'event' }],
  [words('reservation', 'booking', 'book a', 'reserve'), { type: 'reservation' }],
  [words('flight', 'train to', 'ferry to', 'bus to'), { type: 'transport' }],
]

/** Pull a place name (and maybe coordinates) out of a Google Maps link. */
export function parseMapsUrl(url: string): { name?: string; location?: LatLng } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) || !u.pathname.startsWith('/maps')) return null
  const out: { name?: string; location?: LatLng } = {}
  const place = /\/maps\/place\/([^/]+)/.exec(u.pathname)
  if (place) out.name = decodeURIComponent(place[1].replace(/\+/g, ' '))
  const q = u.searchParams.get('q') ?? u.searchParams.get('query')
  if (!out.name && q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) out.name = q
  // Prefer the place's own pin (!3d lat !4d lng) over the map view (@lat,lng).
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url)
  const view = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url)
  const ll = pin ?? view
  if (ll) out.location = { lat: Number(ll[1]), lng: Number(ll[2]) }
  return out
}

function tidy(s: string) {
  return s.replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim()
}

export function parseLine(raw: string, sectionTags: string[] = []): ParsedLine | null {
  let line = raw.replace(BULLET, '').trim()
  if (!line) return null

  let url: string | undefined
  let location: LatLng | undefined
  let fromLink: string | undefined
  const um = URL_RE.exec(line)
  if (um) {
    url = um[0].replace(/[.,;]+$/, '')
    line = tidy(line.replace(um[0], ' '))
    const maps = parseMapsUrl(url)
    if (maps) {
      fromLink = maps.name
      location = maps.location
    }
  }

  const tags = new Set(sectionTags)
  line = line.replace(TAG_RE, (_m, pre, t: string) => {
    tags.add(t.toLowerCase())
    return pre
  })
  line = tidy(line)
  const original = line

  // "Sat: Hietalahti flea market" — a leading day is a hint, not the title.
  line = line.replace(LEADING_DAY, '')

  // "Title - why it's good" / "Title: notes" / "Title (notes)"
  let title = line
  let notes: string | undefined
  const sep = /\s[–—-]\s|:\s|\s\(/.exec(line)
  if (sep && sep.index > 0) {
    title = line.slice(0, sep.index)
    notes = tidy(line.slice(sep.index + sep[0].length).replace(/\)\s*$/, ''))
  }
  title = tidy(title)
  if (!title && fromLink) title = fromLink
  if (fromLink && title.length < 2) title = fromLink
  if (!title) {
    if (!url) return null
    title = fromLink ?? 'Link'
  }

  let type: ItemType = 'place'
  for (const [re, hint] of HINTS) {
    if (!re.test(original)) continue
    if (hint.tag) tags.add(hint.tag)
    if (hint.type && type === 'place') type = hint.type
  }
  let weekday: number | undefined
  for (const [re, d] of WEEKDAYS) {
    if (re.test(original)) {
      weekday = d
      break
    }
  }
  if (type === 'transport' && /\bflight\b/i.test(original)) tags.add('flight')

  return { raw, title, notes: notes || undefined, url, tags: [...tags], type, weekday, location }
}

/**
 * Parse a pasted block. A short line ending in ":" (e.g. "Food:") is a
 * section header: its name becomes a tag on the lines under it.
 */
export function parsePaste(text: string): ParsedLine[] {
  const out: ParsedLine[] = []
  let section: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t) continue
    const header = /^#{0,3}\s*([\p{L}\p{N} &/'-]{2,30}):?\s*$/u.exec(t)
    if (header && t.endsWith(':')) {
      section = [header[1].trim().toLowerCase().replace(/\s+/g, '-')]
      continue
    }
    const p = parseLine(raw, section)
    if (!p) continue
    const key = p.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}
