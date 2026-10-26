import type { LatLng } from '../types'

// Place search via OpenStreetMap's Nominatim (free, no key). Its usage policy
// asks for at most ~1 request/second, so we only search on submit.

export interface PlaceHit {
  name: string
  address: string
  lat: number
  lng: number
  hours?: string
  website?: string
}

interface NominatimResult {
  lat: string
  lon: string
  name?: string
  display_name: string
  extratags?: Record<string, string> | null
}

export async function searchPlaces(q: string, near: LatLng): Promise<PlaceHit[]> {
  const d = 0.35
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    extratags: '1',
    limit: '8',
    viewbox: `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
    bounded: '0',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) throw new Error(`Search failed (${res.status}). Try again in a moment.`)
  const data = (await res.json()) as NominatimResult[]
  return data.map((r) => {
    const parts = r.display_name.split(', ')
    return {
      name: r.name || parts[0],
      address: parts.slice(r.name ? 1 : 0, 4).join(', '),
      lat: Number(r.lat),
      lng: Number(r.lon),
      hours: r.extratags?.opening_hours,
      website: r.extratags?.website ?? r.extratags?.['contact:website'],
    }
  })
}
