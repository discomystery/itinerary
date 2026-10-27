import type { Trip } from '../types'

// Until there's a sync backend, trips travel as files or as a compressed
// link (#trip=...). Whoever opens the link gets a copy of the trip.

function isTrip(x: unknown): x is Trip {
  const t = x as Trip
  return !!t && typeof t.name === 'string' && Array.isArray(t.items) && Array.isArray(t.blocks) && Array.isArray(t.people)
}

export function parseTrip(text: string): Trip {
  const data = JSON.parse(text)
  if (!isTrip(data)) throw new Error('That file is not an itinerary trip.')
  return data
}

export function downloadTrip(trip: Trip) {
  const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${trip.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function shareLink(trip: Trip): Promise<string> {
  // Travel documents (passport numbers, policies) stay on this device.
  const { docs: _docs, ...shared } = trip
  const zipped = await pipe(new TextEncoder().encode(JSON.stringify(shared)), new CompressionStream('gzip'))
  let bin = ''
  for (let i = 0; i < zipped.length; i += 8192) bin += String.fromCharCode(...zipped.subarray(i, i + 8192))
  const enc = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${location.origin}${location.pathname}#trip=${enc}`
}

export async function importFromHash(): Promise<Trip | null> {
  const m = /#trip=([\w-]+)/.exec(location.hash)
  if (!m) return null
  try {
    const raw = await pipe(fromB64url(m[1]), new DecompressionStream('gzip'))
    return parseTrip(new TextDecoder().decode(raw))
  } catch {
    return null
  }
}
