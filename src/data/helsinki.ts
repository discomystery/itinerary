import type { Anchor, Block, Duration, Item, Trip } from '../types'

// Seed trip: NHL Global Series, Helsinki, Nov 2026 (Hurricanes vs Kraken,
// Veikkaus Arena). Game times are from the NHL announcement; doors times and
// all opening hours are estimates and are flagged "unverified" in the UI.

const ME = 'p-me'
const FRIEND = 'p-friend'
const TZ = 'Europe/Helsinki'

const d = (min: number, typical: number, max: number): Duration => ({ min, typical, max })
const a = (id: string, label: string, day: string, hhmm: string, hard: boolean, tz?: string): Anchor => {
  const [h, m] = hhmm.split(':').map(Number)
  return { id, label, day, time: h * 60 + m, hard, ...(tz ? { tz } : {}) }
}

let t = 0
const item = (p: Partial<Item> & Pick<Item, 'id' | 'title' | 'type'>): Item => ({
  anchors: [],
  duration: d(30, 60, 120),
  interest: {},
  tags: [],
  createdAt: Date.UTC(2026, 9, 26) + t++,
  ...p,
})

const ARENA = { lat: 60.2054, lng: 24.9284 }
const ARENA_ADDR = 'Veikkaus Arena, Areenankuja 1, Helsinki'

export const helsinkiItems: Item[] = [
  item({
    id: 'i-game1',
    title: 'Game 1: Hurricanes vs Kraken',
    type: 'event',
    location: ARENA,
    address: ARENA_ADDR,
    anchors: [
      a('a-g1-doors', 'Doors (est.)', '2026-11-12', '17:30', false),
      a('a-g1-puck', 'Puck drop', '2026-11-12', '19:00', true),
    ],
    duration: d(150, 180, 210),
    interest: { [ME]: 'must', [FRIEND]: 'must' },
    tags: ['hockey'],
    notes: 'NHL Global Series. Doors time is a guess, so check the ticket.',
    url: 'https://www.nhl.com/hurricanes/fans/global-series-2026',
  }),
  item({
    id: 'i-game2',
    title: 'Game 2: Kraken vs Hurricanes',
    type: 'event',
    location: ARENA,
    address: ARENA_ADDR,
    anchors: [
      a('a-g2-doors', 'Doors (est.)', '2026-11-14', '18:30', false),
      a('a-g2-puck', 'Puck drop', '2026-11-14', '20:00', true),
    ],
    duration: d(150, 180, 210),
    interest: { [ME]: 'must', [FRIEND]: 'must' },
    tags: ['hockey'],
    notes: 'Doors time is a guess, so check the ticket.',
    url: 'https://www.nhl.com/hurricanes/fans/global-series-2026',
  }),
  item({
    id: 'i-flight-out',
    title: 'Flight RDU → HEL',
    type: 'transport',
    duration: d(600, 720, 900),
    tags: ['flight'],
    tbd: 'Add departure and arrival times',
    notes: 'Leaves Raleigh-Durham Nov 10, lands Helsinki Nov 11.',
  }),
  item({
    id: 'i-airport-train',
    title: 'Airport → city (I/P train)',
    type: 'transport',
    location: { lat: 60.3172, lng: 24.9633 },
    address: 'Helsinki Airport station',
    duration: d(30, 45, 60),
    tags: ['transit'],
    notes: 'Ring Rail I/P trains run to Helsinki Central in about 30 min. You need an HSL ticket that covers zone C.',
  }),
  item({
    id: 'i-stay',
    title: 'Where we’re staying',
    type: 'reservation',
    duration: d(0, 0, 0),
    tags: ['lodging'],
    anchors: [
      a('a-stay-in', 'Check in', '2026-11-11', '15:00', false),
      a('a-stay-out', 'Check out', '2026-11-16', '11:00', true),
    ],
    tbd: 'Add the hotel or Airbnb address',
  }),
  item({
    id: 'i-flight-home',
    title: 'Flight HEL → RDU',
    type: 'transport',
    duration: d(600, 720, 900),
    tags: ['flight'],
    tbd: 'Add departure time (Nov 16)',
  }),
  item({
    id: 'i-suomenlinna',
    title: 'Suomenlinna sea fortress',
    type: 'place',
    location: { lat: 60.1454, lng: 24.9881 },
    address: 'Ferry from Market Square (Kauppatori)',
    duration: d(150, 240, 300),
    prefersDaylight: true,
    interest: { [ME]: 'must', [FRIEND]: 'yes' },
    tags: ['sights', 'outdoors'],
    notes: 'The HSL ferry takes 15–20 min and uses a normal HSL ticket. The island is always open, but museum hours are short in winter. Mid-November daylight is only about 8:15a–4p.',
  }),
  item({
    id: 'i-oodi',
    title: 'Oodi Central Library',
    type: 'place',
    location: { lat: 60.1738, lng: 24.938 },
    address: 'Töölönlahdenkatu 4',
    hours: 'Mo-Fr 08:00-21:00; Sa,Su 10:00-20:00',
    hoursSource: 'unverified',
    duration: d(30, 60, 120),
    interest: { [ME]: 'yes' },
    tags: ['architecture', 'free'],
  }),
  item({
    id: 'i-rock-church',
    title: 'Temppeliaukio (Rock Church)',
    type: 'place',
    location: { lat: 60.1729, lng: 24.9252 },
    address: 'Lutherinkatu 3',
    hours: 'Mo-Sa 10:00-17:00; Su 12:00-17:00',
    hoursSource: 'unverified',
    duration: d(20, 30, 45),
    interest: { [FRIEND]: 'yes' },
    tags: ['architecture', 'sights'],
  }),
  item({
    id: 'i-cathedral',
    title: 'Helsinki Cathedral & Senate Square',
    type: 'place',
    location: { lat: 60.1702, lng: 24.9522 },
    hours: 'Mo-Su 09:00-18:00',
    hoursSource: 'unverified',
    duration: d(15, 30, 45),
    tags: ['sights'],
  }),
  item({
    id: 'i-old-market',
    title: 'Old Market Hall',
    type: 'place',
    location: { lat: 60.1668, lng: 24.9545 },
    address: 'Eteläranta',
    hours: 'Mo-Sa 08:00-18:00; Su off',
    hoursSource: 'unverified',
    duration: d(30, 60, 90),
    interest: { [ME]: 'yes', [FRIEND]: 'yes' },
    tags: ['food'],
    notes: 'Salmon soup, open-faced sandwiches.',
  }),
  item({
    id: 'i-hakaniemi',
    title: 'Hakaniemi Market Hall',
    type: 'place',
    location: { lat: 60.179, lng: 24.951 },
    hours: 'Mo-Sa 08:00-18:00; Su off',
    hoursSource: 'unverified',
    duration: d(30, 45, 75),
    tags: ['food'],
  }),
  item({
    id: 'i-ateneum',
    title: 'Ateneum Art Museum',
    type: 'place',
    location: { lat: 60.1703, lng: 24.9442 },
    address: 'Kaivokatu 2',
    hours: 'Tu,Fr 10:00-18:00; We,Th 10:00-20:00; Sa,Su 10:00-17:00; Mo off',
    hoursSource: 'unverified',
    duration: d(60, 120, 180),
    interest: { [ME]: 'yes', [FRIEND]: 'meh' },
    tags: ['museum'],
  }),
  item({
    id: 'i-kiasma',
    title: 'Kiasma (contemporary art)',
    type: 'place',
    location: { lat: 60.1717, lng: 24.9365 },
    hours: 'Tu-Su 10:00-18:00; Mo off',
    hoursSource: 'unverified',
    duration: d(60, 90, 150),
    tags: ['museum'],
  }),
  item({
    id: 'i-loyly',
    title: 'Löyly (sauna + sea dip)',
    type: 'reservation',
    location: { lat: 60.1525, lng: 24.9278 },
    address: 'Hernesaarenranta 4',
    duration: d(90, 120, 150),
    interest: { [ME]: 'must', [FRIEND]: 'must' },
    tags: ['sauna'],
    tbd: 'Book a sauna time slot',
  }),
  item({
    id: 'i-allas',
    title: 'Allas Sea Pool',
    type: 'place',
    location: { lat: 60.1673, lng: 24.9558 },
    address: 'Katajanokanlaituri 2a',
    duration: d(60, 90, 120),
    tags: ['sauna'],
  }),
  item({
    id: 'i-sibelius',
    title: 'Sibelius Monument',
    type: 'place',
    location: { lat: 60.182, lng: 24.9135 },
    hours: '24/7',
    hoursSource: 'unverified',
    duration: d(15, 30, 45),
    prefersDaylight: true,
    tags: ['sights', 'outdoors'],
  }),
  item({
    id: 'i-kamppi-chapel',
    title: 'Kamppi Chapel of Silence',
    type: 'place',
    location: { lat: 60.1695, lng: 24.9325 },
    hours: 'Mo-Fr 08:00-20:00; Sa,Su 10:00-18:00',
    hoursSource: 'unverified',
    duration: d(10, 15, 30),
    tags: ['architecture', 'free'],
  }),
  item({
    id: 'i-design-district',
    title: 'Wander the Design District',
    type: 'area',
    location: { lat: 60.1635, lng: 24.9425 },
    areaRadius: 600,
    duration: d(60, 120, 180),
    interest: { [FRIEND]: 'must' },
    tags: ['shopping', 'wander'],
    notes: 'Punavuori and Ullanlinna: design shops, vintage stores, cafés.',
  }),
  item({
    id: 'i-kallio',
    title: 'Kallio: bars & cheap eats',
    type: 'area',
    location: { lat: 60.1838, lng: 24.9505 },
    areaRadius: 700,
    duration: d(90, 180, 300),
    interest: { [ME]: 'yes', [FRIEND]: 'yes' },
    tags: ['nightlife', 'food', 'wander'],
  }),
  item({
    id: 'i-pregame',
    title: 'Pre-game food around Pasila / Tripla',
    type: 'area',
    location: { lat: 60.1985, lng: 24.9327 },
    areaRadius: 400,
    duration: d(45, 60, 90),
    tags: ['food', 'hockey'],
    notes: 'Mall of Tripla is right at Pasila station, a short walk to the arena.',
  }),
  item({
    id: 'i-fan-events',
    title: 'Official fan events?',
    type: 'note',
    duration: d(30, 60, 120),
    tags: ['hockey'],
    tbd: 'Look up NHL or Hurricanes fan fest and watch parties',
  }),
]

const blk = (id: string, itemId: string, day: string, s: string, e: string, locked = false): Block => {
  const toMin = (x: string) => {
    const [h, m] = x.split(':').map(Number)
    return h * 60 + m
  }
  return { id, itemId, day, start: toMin(s), end: toMin(e), locked }
}

export const helsinkiBlocks: Block[] = [
  blk('b-1', 'i-old-market', '2026-11-12', '12:00', '13:00'),
  blk('b-2', 'i-ateneum', '2026-11-12', '13:30', '15:30'),
  blk('b-3', 'i-pregame', '2026-11-12', '16:15', '17:15'),
  blk('b-4', 'i-game1', '2026-11-12', '17:30', '22:00', true),
  blk('b-5', 'i-suomenlinna', '2026-11-13', '10:00', '14:00'),
  blk('b-6', 'i-oodi', '2026-11-14', '11:00', '12:15'),
  blk('b-7', 'i-rock-church', '2026-11-14', '12:45', '13:15'),
  blk('b-8', 'i-kallio', '2026-11-14', '14:00', '17:00'),
  blk('b-9', 'i-game2', '2026-11-14', '18:30', '23:00', true),
]

export function helsinkiTrip(): Trip {
  return {
    id: 't-helsinki',
    currency: 'EUR',
    name: 'Helsinki: NHL Global Series',
    startDay: '2026-11-10',
    endDay: '2026-11-16',
    timezone: TZ,
    center: { lat: 60.1699, lng: 24.9384 },
    defaultMode: 'transit',
    people: [
      { id: ME, name: 'Me', color: '#e11d48' },
      { id: FRIEND, name: 'Friend', color: '#0284c7' },
    ],
    items: structuredClone(helsinkiItems),
    blocks: structuredClone(helsinkiBlocks),
  }
}
