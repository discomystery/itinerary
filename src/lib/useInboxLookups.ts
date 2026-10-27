import { useEffect } from 'react'
import { useStore } from '../store'
import type { Item, PlaceMatch } from '../types'
import { searchPlaces } from './places'
import { distanceMeters } from './transit'

// Pasted ideas are looked up on OpenStreetMap one at a time in the background.
// Nominatim asks for at most one request a second, so we wait between them.

const GAP_MS = 1100

/** What adopting a map match changes on an idea. */
export function applyMatch(item: Item, m: PlaceMatch): Partial<Item> {
  return {
    location: { lat: m.lat, lng: m.lng },
    address: m.address,
    ...(m.hours ? { hours: m.hours, hoursSource: 'osm' as const } : {}),
    ...(m.website && !item.url ? { url: m.website } : {}),
  }
}

export function useInboxLookups() {
  const pending = useStore((s) => s.trip.items.find((i) => i.inbox?.lookup === 'pending'))
  const center = useStore((s) => s.trip.center)
  const quiet = useStore((s) => s.quietUpdateItem)

  useEffect(() => {
    if (!pending?.inbox) return
    const item = pending
    const inbox = pending.inbox
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const hits = await searchPlaces(item.title, center, { bounded: true, limit: 5 })
        if (cancelled) return
        const current = useStore.getState().trip.items.find((i) => i.id === item.id)
        if (!current?.inbox) return
        if (!hits.length) {
          quiet(item.id, { inbox: { ...inbox, lookup: 'none', matches: [] } })
          return
        }
        // A Google Maps link already gave us the pin: only borrow details from
        // a match that's right there.
        if (current.location) {
          const near = hits.find((h) => distanceMeters(current.location!, h) < 250)
          quiet(item.id, {
            ...(near ? { ...applyMatch(current, near), location: current.location } : {}),
            inbox: { ...inbox, lookup: 'found', matches: hits },
          })
          return
        }
        quiet(item.id, { ...applyMatch(current, hits[0]), inbox: { ...inbox, lookup: 'found', matches: hits } })
      } catch {
        if (!cancelled) quiet(item.id, { inbox: { ...inbox, lookup: 'error' } })
      }
    }, GAP_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending?.id, center, quiet])
}
