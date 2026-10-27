import { CarTaxiFront, ChevronRight, Footprints, type LucideIcon, Navigation, Sunrise, Sunset, TramFront, TriangleAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import { daylight } from '../lib/hours'
import { useFetchRoutes, useRoutes } from '../lib/routeCache'
import { type Leg, makeCtx } from '../lib/schedule'
import { fmtDistance, directionsUrl, MODES } from '../lib/transit'
import { fmtDuration } from '../lib/time'
import { itemById, useStore } from '../store'
import type { Block, TransitMode, Trip } from '../types'
import { clock } from './objects'
import { cx, Sheet } from './ui'

// Transit is drawn as a rail running between plans, with each leg a small
// tappable pill on it. Pills stay a level below the paper objects and only
// get louder when the connection is tight.

export const MODE_STYLE: Record<TransitMode, { Icon: LucideIcon; name: string; c: string; t: string; dk: string }> = {
  walk: { Icon: Footprints, name: 'Walk', c: '#6b7280', t: '#e9ebef', dk: '#3f4652' },
  transit: { Icon: TramFront, name: 'Transit', c: '#00985f', t: '#dcf1e7', dk: '#0b5a3b' },
  drive: { Icon: CarTaxiFront, name: 'Taxi', c: '#d49b00', t: '#fbf0cf', dk: '#6b4d00' },
}

export const railVars = (mode?: TransitMode) =>
  (mode ? { '--c': MODE_STYLE[mode].c, '--t': MODE_STYLE[mode].t, '--dk': MODE_STYLE[mode].dk } : {}) as CSSProperties

/** When you need to leave for a leg: the timetabled departure, else the destination's start minus travel. */
export function leaveAt(trip: Trip, leg: Leg): number {
  if (leg.leave != null) return leg.leave
  const to = trip.blocks.find((b) => b.id === leg.toId)!
  return to.start - leg.minutes
}

/** `late`: minutes past the leave-by time already (the Now view). */
export function LegPill({ trip, leg, late, onOpen }: { trip: Trip; leg: Leg; late?: number; onOpen: () => void }) {
  const m = MODE_STYLE[leg.mode]
  const from = trip.blocks.find((b) => b.id === leg.fromId)
  const short = late ?? (!leg.tight ? 0 : leg.leave != null && from ? from.end - leg.leave : leg.minutes - Math.max(0, leg.gap))
  return (
    <div className={cx('rail', leg.mode === 'walk' && 'walk')} style={railVars(leg.mode)}>
      <button className={cx('pill', leg.tight && 'tight')} onClick={onOpen} aria-label={`${leg.line ?? m.name} ${leg.minutes} minutes, leave at ${clock(leaveAt(trip, leg))}. Change how you get there`}>
        <span className="mi">{leg.tight ? <TriangleAlert /> : <m.Icon />}</span>
        {leg.line && `${leg.line} · `}{leg.minutes} min
        <small>· {leg.tight ? `${short} min short` : `leave ${clock(leaveAt(trip, leg))}`}</small>
        <ChevronRight />
      </button>
    </div>
  )
}

/** The rail with nothing on it, between plans that have no leg (e.g. a note). */
export function RailGap() {
  return <div className="rail none" style={{ minHeight: 10 }} />
}

/** "SUNSET 3:59" set on the rail, the way a map labels a line. */
export function RailMark({ label, mode }: { label: string; mode?: TransitMode }) {
  return (
    <div className={cx('railmark', mode === 'walk' && 'walk')} style={railVars(mode)}>
      <span>{label}</span>
    </div>
  )
}

/** The day's light from 6a to midnight, drawn in the rail's language. */
export function Horizon({ trip, day, now }: { trip: Trip; day: string; now?: number }) {
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  if (!dl) return null
  const t0 = 6 * 60
  const span = 18 * 60
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - t0) / span) * 100))}%`
  const lit = now != null && now > dl.sunrise && now < dl.sunset
  const left = lit ? dl.sunset - now! : dl.sunset - dl.sunrise
  return (
    <div className="horizon" aria-label={`Sunrise ${clock(dl.sunrise)}, sunset ${clock(dl.sunset)}`}>
      <div className="track">
        <span className="night" />
        <span className="day" style={{ left: pct(dl.sunrise), right: `calc(100% - ${pct(dl.sunset)})` }} />
        {now != null && now > dl.sunrise && (
          <span className="past" style={{ left: pct(dl.sunrise), right: `calc(100% - ${pct(Math.min(now, dl.sunset))})` }} />
        )}
        {now != null && now >= t0 && now <= t0 + span && <span className="nowm" style={{ left: pct(now) }} />}
      </div>
      <div className="lbls">
        <span><Sunrise /> {clock(dl.sunrise)}</span>
        <span>
          {now != null && now >= dl.sunset ? 'After dark' : (<><b>{fmtDuration(left)}</b>&nbsp;{lit ? 'of light left' : 'of daylight'}</>)}
        </span>
        <span>{clock(dl.sunset)} <Sunset /></span>
      </div>
    </div>
  )
}

/** Tap a leg: compare ways to get there, each with its own leave-by time. */
export function LegSheet({ leg, onClose }: { leg: Leg; onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const updateBlock = useStore((s) => s.updateBlock)
  const routes = useRoutes((s) => s.routes)
  const ctx = makeCtx(trip, routes)
  const from = trip.blocks.find((b) => b.id === leg.fromId) as Block
  const to = trip.blocks.find((b) => b.id === leg.toId) as Block
  const fromItem = itemById(trip, from.itemId)!
  const toItem = itemById(trip, to.itemId)!
  const current = trip.blocks.find((b) => b.id === leg.toId)?.modeIn ?? leg.mode
  const options = MODES.map((mode) => {
    const r = ctx.route(from, to, mode)
    const mins = ctx.travel(from, to, mode)
    const leave = r?.leave ?? to.start - mins
    return { mode, r, mins, leave, short: from.end - leave }
  })
  useFetchRoutes([...ctx.missing.values()])
  return (
    <Sheet open onClose={onClose} title={`${fromItem.title} → ${toItem.title}`}>
      <p className="mb-3 text-sm t-sub">
        Arrive by {clock(to.start)} · {fmtDistance(leg.meters)} · you're free from {clock(from.end)}
      </p>
      <div className="flex flex-col gap-2">
        {options.map(({ mode, r, mins, leave, short }) => {
          const m = MODE_STYLE[mode]
          const on = current === mode
          return (
            <button
              key={mode}
              onClick={() => updateBlock(to.id, { modeIn: mode })}
              className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left"
              style={{ boxShadow: on ? 'inset 0 0 0 2px var(--ink)' : 'inset 0 0 0 1px var(--line)' }}
              aria-pressed={on}
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: m.c }}><m.Icon size={17} /></span>
              <span>
                <span className="block text-sm font-semibold">{m.name}</span>
                <span className="block font-mono text-xs t-sub">
                  {r ? '' : '~'}{mins} min{r?.line ? ` · ${r.line}` : ''}{short > 0 ? ` · ${short} min short` : ''}
                </span>
              </span>
              <span className="text-right font-mono text-sm font-semibold" style={{ color: short > 0 ? '#b45309' : undefined }}>
                <span className="label block">Leave</span>
                {clock(leave)}
              </span>
            </button>
          )
        })}
      </div>
      {toItem.location && (
        <a className="btn mt-4 w-full py-3" href={directionsUrl(fromItem.location, toItem.location, current)} target="_blank" rel="noreferrer">
          <Navigation size={16} /> Directions in Google Maps
        </a>
      )}
      <p className="mt-3 text-xs t-sub">
        Routes and timetables from {SOURCE_NAMES}. Times marked ~ are estimates from distance until a route loads.
      </p>
    </Sheet>
  )
}

const SOURCE_NAMES = 'OpenStreetMap, HSL and Transitous'
