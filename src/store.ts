import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { helsinkiTrip } from './data/helsinki'
import { defaultMapsApp, type MapsApp } from './lib/transit'
import type { Block, Id, Interest, Item, Person, Trip } from './types'

// All trip data lives behind this one store, so swapping localStorage for a
// sync backend later only touches this file.

export const uid = (p = 'x') => `${p}-${crypto.randomUUID().slice(0, 8)}`

export type Tab = 'now' | 'plan' | 'map' | 'ideas' | 'trip'

interface State {
  trip: Trip
  viewer: Id
  tab: Tab
  day: string
  /** Pretend it's this instant (ms) — for testing the Now view before the trip. */
  simNow: number | null
  history: Trip[]
  editing: Id | null
  /** This device's maps app for directions and "open in maps" links. */
  mapsApp: MapsApp

  setTab: (t: Tab) => void
  setDay: (d: string) => void
  setViewer: (p: Id) => void
  setSimNow: (ms: number | null) => void
  edit: (id: Id | null) => void
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

  addBlock: (b: Omit<Block, 'id'>) => Id
  updateBlock: (id: Id, p: Partial<Block>) => void
  removeBlock: (id: Id) => void
  setBlocks: (blocks: Block[]) => void

  addPerson: (name: string) => void
  updatePerson: (id: Id, p: Partial<Person>) => void
  removePerson: (id: Id) => void

  replaceTrip: (t: Trip) => void
}

const PALETTE = ['#e11d48', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#4f46e5']

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutate = (fn: (t: Trip) => Trip) =>
        set((s) => ({ trip: fn(s.trip), history: [...s.history.slice(-29), s.trip] }))
      const seed = helsinkiTrip()
      return {
        trip: seed,
        viewer: seed.people[0].id,
        tab: 'plan',
        day: '2026-11-12',
        simNow: null,
        history: [],
        editing: null,
        mapsApp: defaultMapsApp(),

        setTab: (tab) => set({ tab }),
        setDay: (day) => set({ day }),
        setViewer: (viewer) => set({ viewer }),
        setSimNow: (simNow) => set({ simNow }),
        edit: (editing) => set({ editing }),
        setMapsApp: (mapsApp) => set({ mapsApp }),

        mutate,
        undo: () =>
          set((s) => (s.history.length ? { trip: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s)),

        addItem: (p) => {
          const id = uid('i')
          const item: Item = {
            id,
            title: 'New idea',
            type: 'place',
            anchors: [],
            duration: { min: 30, typical: 60, max: 120 },
            interest: { [get().viewer]: 'yes' },
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
          })),

        replaceTrip: (trip) => {
          mutate(() => trip)
          set({ viewer: trip.people[0]?.id ?? '', day: trip.startDay })
        },
      }
    },
    {
      name: 'itinerary-v1',
      partialize: (s) => ({ trip: s.trip, viewer: s.viewer, day: s.day, tab: s.tab, simNow: s.simNow, mapsApp: s.mapsApp }),
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
