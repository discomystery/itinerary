import { addDays } from '../lib/time'
import type { Trip } from '../types'

/** An empty trip to start your own: you, three days from today, and nothing planned yet. */
export function blankTrip(from: Trip, meId?: string): Trip {
  const me = from.people.find((p) => p.id === meId) ?? from.people[0] ?? { id: 'p-me', name: 'Me', color: '#e11d48' }
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    id: `t-${crypto.randomUUID().slice(0, 8)}`,
    name: 'My trip',
    startDay: today,
    endDay: addDays(today, 2),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || from.timezone,
    center: from.center,
    defaultMode: from.defaultMode,
    people: [me],
    items: [],
    blocks: [],
  }
}
