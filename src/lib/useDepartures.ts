import { useEffect, useState } from 'react'
import { type Departure, type DepartureQuery, fetchDepartures } from './routing'

// Live departures aren't cached: they're only worth anything for a minute.
const REFRESH_MS = 60_000

/** Departures for a transit leg, refreshed every minute while `live`. Pass null to skip. */
export function useDepartures(q: DepartureQuery | null, live: boolean): { deps: Departure[] | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; deps: Departure[] | null; failed: boolean }>({ key: '', deps: null, failed: false })
  const key = q ? `${q.from.lat},${q.from.lng}|${q.to.lat},${q.to.lng}|${q.day}|${q.after}|${q.window}` : ''
  useEffect(() => {
    if (!q) return
    let ctl: AbortController | undefined
    const load = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      ctl?.abort()
      ctl = new AbortController()
      fetchDepartures(q, ctl.signal)
        .then((deps) => setState({ key, deps, failed: false }))
        .catch((e) => e?.name !== 'AbortError' && setState((s) => ({ key, deps: s.key === key ? s.deps : null, failed: true })))
    }
    load()
    const id = live ? setInterval(load, REFRESH_MS) : undefined
    return () => {
      ctl?.abort()
      if (id) clearInterval(id)
    }
  }, [key, live])
  return state.key === key ? { deps: state.deps, failed: state.failed } : { deps: null, failed: false }
}
