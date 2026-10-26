import type { LatLng, TransitMode } from '../types'

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Rough city-travel model: straight-line distance × detour factor at a mode
// speed, plus fixed overhead (waiting for a tram, finding the car). Good
// enough to flag a tight connection; the Directions link has the real route.
const MODEL: Record<TransitMode, { kmh: number; detour: number; overhead: number }> = {
  walk: { kmh: 4.8, detour: 1.3, overhead: 0 },
  transit: { kmh: 20, detour: 1.35, overhead: 8 },
  drive: { kmh: 25, detour: 1.4, overhead: 6 },
}

export function travelMinutes(a: LatLng, b: LatLng, mode: TransitMode): number {
  const km = distanceMeters(a, b) / 1000
  if (km < 0.05) return 0
  const m = MODEL[mode]
  return Math.max(2, Math.round(m.overhead + ((km * m.detour) / m.kmh) * 60))
}

/** Walk short hops, otherwise use the trip's default mode. */
export function suggestMode(a: LatLng, b: LatLng, fallback: TransitMode): TransitMode {
  return distanceMeters(a, b) <= 1200 ? 'walk' : fallback
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}

const GMAPS_MODE: Record<TransitMode, string> = { walk: 'walking', transit: 'transit', drive: 'driving' }

export function directionsUrl(from: LatLng | undefined, to: LatLng, mode: TransitMode): string {
  const p = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: GMAPS_MODE[mode] })
  if (from) p.set('origin', `${from.lat},${from.lng}`)
  return `https://www.google.com/maps/dir/?${p}`
}

export const MODE_ICON: Record<TransitMode, string> = { walk: '🚶', transit: '🚋', drive: '🚕' }
export const MODES: TransitMode[] = ['walk', 'transit', 'drive']
