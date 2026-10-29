import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { blankTrip } from './data/blank'
import { helsinkiTrip } from './data/helsinki'
import { deviceTimeZone, isTimeZone } from './lib/time'
import { defaultMapsApp, type MapsApp } from './lib/transit'
import type { Block, Id, Interest, Item, Person, Trip } from './types'

// All trip data lives behind this one store, so swapping localStorage for a
// sync backend later only touches this file.

export const uid = (p = 'x') => `${p}-${crypto.randomUUID().slice(0, 8)}`

export type Tab = 'now' | 'plan' | 'map' | 'ideas' | 'trip'

interface State {
  trip: Trip
  viewer: Id
  /** Organizer mode: set anyone's votes and who's going, without switching identity. This device only. */
  organizer: boolean
  tab: Tab
  day: string
  /** Pretend it's this instant (ms) — for testing the Now view before the trip. */
  simNow: number | null
  history: Trip[]
  editing: Id | null
  /** The plan shown in the details pane on wide screens. Not saved. */
  selected: Id | null
  /** This device's maps app for directions and "open in maps" links. */
  mapsApp: MapsApp
  /** Closed the "this is a sample trip" note. */
  sampleDismissed: boolean
  /** Just started fresh: offer undo. Not saved. */
  cleared: boolean

  setTab: (t: Tab) => void
  setDay: (d: string) => void
  setViewer: (p: Id) => void
  setOrganizer: (on: boolean) => void
  setSimNow: (ms: number | null) => void
  edit: (id: Id | null) => void
  select: (id: Id | null) => void
  setMapsApp: (a: MapsApp) => void

  mutate: (fn: (t: Trip) => Trip) => void
  undo: () => void

  addItem: (p: Partial<Item>) => Id
  /** Add many ideas as one undo step. */
  addItems: (ps: Partial<Item>[]) => Id[]
  updateItem: (id: Id, p: Partial<Item>) => void
  /** Background updates (place lookups) that shouldn't land on the undo stack. */
  quietUpdateItem: (id: Id, p: Partial<Item>) => void
  deleteItem: (id: Id) => void
  setInterest: (itemId: Id, personId: Id, v: Interest | null) => void
  /** Everyone's vote at once, as one undo step. */
  setInterestAll: (itemId: Id, v: Interest | null) => void

  addBlock: (b: Omit<Block, 'id'>) => Id
  updateBlock: (id: Id, p: Partial<Block>) => void
  removeBlock: (id: Id) => void
  setBlocks: (blocks: Block[]) => void

  addPerson: (name: string) => void
  updatePerson: (id: Id, p: Partial<Person>) => void
  removePerson: (id: Id) => void

  replaceTrip: (t: Trip) => void
  /** Clear everything for an empty trip of your own (one undo step). Travel documents stay. */
  startFresh: () => void
  dismissSample: () => void
  setCleared: (on: boolean) => void
}

export const SAMPLE_ID = 't-helsinki'

const PALETTE = ['#e11d48', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#4f46e5']

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutate = (fn: (t: Trip) => Trip) =>
        set((s) => ({ trip: fn(s.trip), history: [...s.history.slice(-29), s.trip], cleared: false }))
      const seed = helsinkiTrip()
      return {
        trip: seed,
        viewer: seed.people[0].id,
        organizer: false,
        tab: 'plan',
        day: '2026-11-12',
        simNow: null,
        history: [],
        editing: null,
        selected: null,
        mapsApp: defaultMapsApp(),
        sampleDismissed: false,
        cleared: false,

        setTab: (tab) => set({ tab }),
        setDay: (day) => set({ day }),
        setViewer: (viewer) => set({ viewer, organizer: false }),
        setOrganizer: (organizer) => set({ organizer }),
        setSimNow: (simNow) => set({ simNow }),
        edit: (editing) => set({ editing }),
        select: (selected) => set({ selected }),
        setMapsApp: (mapsApp) => set({ mapsApp }),

        mutate,
        undo: () =>
          set((s) => {
            if (!s.history.length) return s
            const trip = s.history[s.history.length - 1]
            // Undoing a whole-trip swap can leave the picked day outside the trip.
            const day = s.day < trip.startDay || s.day > trip.endDay ? trip.startDay : s.day
            return { trip, history: s.history.slice(0, -1), day, cleared: false }
          }),

        addItem: (p) => {
          const id = uid('i')
          const item: Item = {
            id,
            title: 'New idea',
            type: 'place',
            anchors: [],
            duration: { min: 30, typical: 60, max: 120 },
            interest: get().organizer ? {} : { [get().viewer]: 'yes' },
            tags: [],
            createdAt: Date.now(),
            ...p,
          }
          mutate((t) => ({ ...t, items: [...t.items, item] }))
          return id
        },
        addItems: (ps) => {
          const now = Date.now()
          const items: Item[] = ps.map((p, n) => ({
            id: uid('i'),
            title: 'New idea',
            type: 'place',
            anchors: [],
            duration: { min: 30, typical: 60, max: 120 },
            interest: {},
            tags: [],
            createdAt: now + n,
            ...p,
          }))
          mutate((t) => ({ ...t, items: [...t.items, ...items] }))
          return items.map((i) => i.id)
        },
        updateItem: (id, p) => mutate((t) => ({ ...t, items: t.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })),
        quietUpdateItem: (id, p) => set((s) => ({ trip: { ...s.trip, items: s.trip.items.map((i) => (i.id === id ? { ...i, ...p } : i)) } })),
        deleteItem: (id) =>
          mutate((t) => ({ ...t, items: t.items.filter((i) => i.id !== id), blocks: t.blocks.filter((b) => b.itemId !== id) })),
        setInterest: (itemId, personId, v) =>
          mutate((t) => ({
            ...t,
            items: t.items.map((i) => {
              if (i.id !== itemId) return i
              const interest = { ...i.interest }
              if (v) interest[personId] = v
              else delete interest[personId]
              return { ...i, interest }
            }),
          })),
        setInterestAll: (itemId, v) =>
          mutate((t) => ({
            ...t,
            items: t.items.map((i) => (i.id === itemId ? { ...i, interest: v ? Object.fromEntries(t.people.map((p) => [p.id, v])) : {} } : i)),
          })),

        addBlock: (b) => {
          const id = uid('b')
          mutate((t) => ({ ...t, blocks: [...t.blocks, { ...b, id }] }))
          return id
        },
        updateBlock: (id, p) => mutate((t) => ({ ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) })),
        removeBlock: (id) => mutate((t) => ({ ...t, blocks: t.blocks.filter((b) => b.id !== id) })),
        setBlocks: (blocks) => mutate((t) => ({ ...t, blocks })),

        addPerson: (name) =>
          mutate((t) => ({
            ...t,
            people: [...t.people, { id: uid('p'), name, color: PALETTE[t.people.length % PALETTE.length] }],
          })),
        updatePerson: (id, p) => mutate((t) => ({ ...t, people: t.people.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
        removePerson: (id) =>
          mutate((t) => ({
            ...t,
            people: t.people.filter((p) => p.id !== id),
            items: t.items.map((i) => {
              const interest = { ...i.interest }
              delete interest[id]
              return { ...i, interest }
            }),
            blocks: t.blocks.map((b) => (b.who ? { ...b, who: b.who.filter((p) => p !== id) } : b)),
          })),

        replaceTrip: (trip) => {
          // Your travel documents are yours: a shared or sample trip doesn't replace them.
          mutate((cur) => ({ ...trip, docs: trip.docs ?? cur.docs }))
          set({ viewer: trip.people[0]?.id ?? '', organizer: false, day: trip.startDay })
        },
        startFresh: () => {
          get().replaceTrip(blankTrip(get().trip, get().viewer))
          set({ selected: null, editing: null, simNow: null, cleared: true })
        },
        dismissSample: () => set({ sampleDismissed: true }),
        setCleared: (cleared) => set({ cleared }),
      }
    },
    {
      name: 'itinerary-v1',
      version: 4,
      migrate: (state, version) => {
        const s = state as { trip?: Trip }
        // v4: a half-typed time zone could get saved and crash every screen on load.
        if (version < 4 && s.trip && !isTimeZone(s.trip.timezone)) s.trip.timezone = s.trip.id === SAMPLE_ID ? helsinkiTrip().timezone : deviceTimeZone()
        // v3: prices. The Helsinki sample is in euros.
        if (version < 3 && s.trip?.id === 't-helsinki' && !s.trip.currency) s.trip.currency = 'EUR'
        // v2: stays run check in → check out so they show on the days between.
        const stay = s.trip?.items.find((i) => i.id === 'i-stay')
        if (version < 2 && stay && !stay.anchors.length) {
          const seed = helsinkiTrip().items.find((i) => i.id === 'i-stay')!
          stay.anchors = seed.anchors
        }
        return state as State
      },
      partialize: (s) => ({ trip: s.trip, viewer: s.viewer, organizer: s.organizer, day: s.day, tab: s.tab, simNow: s.simNow, mapsApp: s.mapsApp, sampleDismissed: s.sampleDismissed }),
    },
  ),
)

export function useTrip() {
  return useStore((s) => s.trip)
}

/** Ideas that are part of the trip (not still waiting in the Inbox). */
export function ideas(trip: Trip) {
  return trip.items.filter((i) => !i.inbox)
}

export function inboxItems(trip: Trip) {
  return trip.items.filter((i) => i.inbox).sort((a, b) => a.createdAt - b.createdAt)
}

export function itemById(trip: Trip, id: Id) {
  return trip.items.find((i) => i.id === id)
}
