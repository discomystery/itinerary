import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchRoute, isStale, type Route, type RouteRequest } from './routing'

// Fetched routes, kept per device (not in the trip, so they don't bloat share
// links or the undo stack). Views read them through makeCtx and ask for the
// ones they're missing with useFetchRoutes.

const MAX_ENTRIES = 600

interface RouteState {
  routes: Record<string, Route>
  put: (key: string, r: Route) => void
  clear: () => void
}

export const useRoutes = create<RouteState>()(
  persist(
    (set) => ({
      routes: {},
      put: (key, r) =>
        set((s) => {
          const routes = { ...s.routes, [key]: r }
          const keys = Object.keys(routes)
          if (keys.length > MAX_ENTRIES) {
            keys.sort((a, b) => routes[a].fetchedAt - routes[b].fetchedAt)
            for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete routes[k]
          }
          return { routes }
        }),
      clear: () => set({ routes: {} }),
    }),
    { name: 'itinerary-routes-v1' },
  ),
)

export const cachedRoutes = () => useRoutes.getState().routes

// One small queue for the whole app: these are free community services, so
// stay polite (two at a time) and don't retry a failure for a while.
const CONCURRENCY = 2
const RETRY_MS = 10 * 60_000
const queue: RouteRequest[] = []
const queued = new Set<string>()
const failedAt = new Map<string, number>()
let running = 0

export function requestRoutes(reqs: RouteRequest[]) {
  const routes = cachedRoutes()
  const now = Date.now()
  for (const r of reqs) {
    const have = routes[r.key]
    if ((have && !isStale(have, now)) || queued.has(r.key)) continue
    if (now - (failedAt.get(r.key) ?? 0) < RETRY_MS) continue
    queued.add(r.key)
    queue.push(r)
  }
  pump()
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const req = queue.shift()!
    running++
    fetchRoute(req)
      .then((route) => {
        if (route) useRoutes.getState().put(req.key, route)
        else failedAt.set(req.key, Date.now())
      })
      .catch(() => failedAt.set(req.key, Date.now()))
      .finally(() => {
        running--
        queued.delete(req.key)
        pump()
      })
  }
}

/** Fetch whatever routes these legs are missing, in the background. */
export function useFetchRoutes(reqs: RouteRequest[]) {
  const sig = reqs.map((r) => r.key).join('\n')
  useEffect(() => {
    if (reqs.length && typeof navigator !== 'undefined' && navigator.onLine !== false) requestRoutes(reqs)
  }, [sig])
}
