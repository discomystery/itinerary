// Core data model. Times on the schedule are wall-clock minutes in the trip's
// timezone; `day` is an ISO date (YYYY-MM-DD). Minutes may exceed 1440 for
// late-night plans that run past midnight.

export type Id = string

export interface Person {
  id: Id
  name: string
  color: string
}

export type ItemType = 'place' | 'event' | 'reservation' | 'area' | 'transport' | 'note'

export type Interest = 'must' | 'yes' | 'meh' | 'no'

/** The paper object an item is drawn as. */
export type CardKind = 'ticket' | 'pass' | 'fare' | 'xfer' | 'resv' | 'key' | 'tag' | 'car' | 'voucher' | 'cpass' | 'post' | 'map' | 'note'

export interface CheckItem {
  id: Id
  text: string
  done: boolean
}

export interface LatLng {
  lat: number
  lng: number
}

/** A labeled moment attached to an item, e.g. "Doors" (soft) or "Puck drop" (hard). */
export interface Anchor {
  id: Id
  label: string
  day: string
  time: number // minutes from midnight, in `tz` (or the trip timezone)
  hard: boolean
  /** For things like a departure from home: the anchor's own timezone. */
  tz?: string
}

export interface Duration {
  min: number
  typical: number
  max: number
}

export type HoursSource = 'osm' | 'manual' | 'unverified'

export interface Item {
  id: Id
  title: string
  type: ItemType
  location?: LatLng
  address?: string
  /** Nebulous areas: a center + radius in meters (e.g. "wander Kallio"). */
  areaRadius?: number
  /** OSM opening_hours syntax, e.g. "Mo-Fr 10:00-18:00; Sa 11:00-16:00". */
  hours?: string
  hoursSource?: HoursSource
  anchors: Anchor[]
  duration: Duration
  /** Soft preference: this is best done while it's light out. */
  prefersDaylight?: boolean
  interest: Record<Id, Interest>
  tags: string[]
  notes?: string
  url?: string
  /** Shown as "needs details" until someone fills in what's missing. */
  tbd?: string
  createdAt: number
  /** Added in bulk and waiting for someone to review it in the Inbox. */
  inbox?: InboxInfo
  /** Which paper object to draw. Worked out from type and tags when unset. */
  card?: CardKind
  /** A style within the kind, e.g. a boarding pass for a 'train' or a 'timed' ticket. */
  variant?: string
  /** Kind-specific fields (seat, gate, door code…), keyed by field id. */
  details?: Record<string, string>
  checklist?: CheckItem[]
  /** Day a postcard was stamped visited. */
  visited?: string
  /** Planned price, in the trip's currency. */
  cost?: Cost
  /** Flights: one entry per leg, in order. Connections are worked out from these. */
  legs?: FlightLeg[]
}

/** A wall time in a specific place, e.g. 7:05a on Nov 10 in Raleigh. */
export interface LocalTime {
  day: string
  time: number
  /** Defaults to the airport's timezone, then the trip's. */
  tz?: string
}

export interface FlightLeg {
  id: Id
  /** IATA airport codes, e.g. "RDU" → "JFK". */
  from: string
  to: string
  /** e.g. "AA 4421" */
  flightNo?: string
  depart: LocalTime
  arrive: LocalTime
  seat?: string
  confirmation?: string
}

export interface Cost {
  amount: number
  /** Each person pays `amount`, or the group pays it once between them. */
  per: 'person' | 'group'
}

export type DocKind = 'passport' | 'entry' | 'insurance' | 'loyalty' | 'other'

/** Trip-level papers that never go on the schedule. */
export interface TravelDoc {
  id: Id
  kind: DocKind
  label: string
  value?: string
}

export interface PlaceMatch {
  name: string
  address: string
  lat: number
  lng: number
  hours?: string
  website?: string
}

export interface InboxInfo {
  /** The line as it was pasted. */
  raw: string
  lookup: 'pending' | 'found' | 'none' | 'error' | 'skip'
  /** Other places the lookup found, best first. */
  matches?: PlaceMatch[]
  /** Weekday the paste mentioned (0 = Sunday). */
  weekday?: number
  addedBy?: Id
}

export type TransitMode = 'walk' | 'transit' | 'drive'

export interface Block {
  id: Id
  itemId: Id
  day: string
  start: number
  end: number
  /** Locked blocks are hard: running-late reflow never moves them. */
  locked: boolean
  /** How the group gets *to* this block from the previous one. */
  modeIn?: TransitMode
  /** If set, only these people are in this block (group splits, later). */
  who?: Id[]
}

export interface Trip {
  id: Id
  name: string
  startDay: string
  endDay: string
  timezone: string
  /** Map default center (and search bias). */
  center: LatLng
  people: Person[]
  items: Item[]
  blocks: Block[]
  defaultMode: TransitMode
  docs?: TravelDoc[]
  /** ISO 4217 code for prices, e.g. "EUR". */
  currency?: string
}
