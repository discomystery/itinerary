import type { LucideIcon } from 'lucide-react'
import { CalendarPlus, Navigation, Pencil, Undo2, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { clock, ObjectCard } from './objects'
import { LegSheet } from './rail'
import { Avatar, cx } from './ui'
import { useRoutes } from '../lib/routeCache'
import { analyzeDay, anchoredSlot, findSlot, type Leg, makeCtx } from '../lib/schedule'
import { dayLabel } from '../lib/time'
import { directionsUrl } from '../lib/transit'
import { itemById, type Tab, useStore } from '../store'
import type { Trip } from '../types'
import { BlockDetail } from '../views/PlanView'

// Chrome for the tablet and desktop layouts: the top bar, and the details pane
// that shows the picked card unfolded beside the board.

export type TabDef = { id: Tab; Icon: LucideIcon; label: string }

export function UndoButton() {
  const past = useStore((s) => s.history)
  const undo = useStore((s) => s.undo)
  if (!past.length) return null
  return (
    <button className="btn-ghost h-8 px-2" onClick={undo} title="Undo" aria-label="Undo">
      <Undo2 size={17} />
    </button>
  )
}

export function WhoAmI() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const setViewer = useStore((s) => s.setViewer)
  const me = trip.people.find((p) => p.id === viewer) ?? trip.people[0]
  if (!me) return null
  return (
    <label className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs" title="Votes are cast as this person">
      <Avatar person={me} size={22} />
      <select className="bg-transparent font-semibold outline-none" value={me.id} onChange={(e) => setViewer(e.target.value)} aria-label="Voting as">
        {trip.people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  )
}

/** iPadOS-style tab bar: a centered pill at the top instead of the bottom bar. */
export function TopTabs({ tabs }: { tabs: TabDef[] }) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  return (
    <nav className="toptabs" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

/** A dark, lit stage the picked card sits on, settling into place each time the pick changes. */
function Stage({ id, grow, children }: { id: string; grow?: boolean; children: ReactNode }) {
  return (
    <div className={cx('stage', grow && 'grow')}>
      <div key={id} className="hero">{children}</div>
    </div>
  )
}

/** What the details pane shows: a plan on a day, or an idea still in the pool. */
export function picked(trip: Trip, selected: string | null) {
  if (!selected) return null
  const block = trip.blocks.find((b) => b.id === selected)
  const item = itemById(trip, block ? block.itemId : selected)
  return item ? { block, item } : null
}

/** The picked card unfolded, big, on its own bit of desk, with what you can do with it below. */
export function DetailPane() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const selected = useStore((s) => s.selected)
  const mapsApp = useStore((s) => s.mapsApp)
  const { select, setDay, removeBlock, addBlock, edit } = useStore()
  const routes = useRoutes((s) => s.routes)
  const ctx = useMemo(() => makeCtx(trip, routes), [trip, routes])
  const p = picked(trip, selected)
  const bday = p?.block?.day ?? day
  const analysis = useMemo(() => analyzeDay(trip, bday, ctx), [trip, bday, ctx])
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !useStore.getState().editing && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])
  if (!p) return null
  const { block: b, item } = p

  const close = (
    <button className="ib" onClick={() => select(null)} aria-label="Close details"><X /></button>
  )

  if (!b) {
    // An idea: the card unfolded, and a way onto the current day.
    const anchored = anchoredSlot(item, trip.timezone)
    const slot = anchored ?? findSlot(trip, day, item)
    const onDay = anchored?.day ?? day
    return (
      <div className="detail">
        <div className="dh">
          <div className="x"><b>Idea</b><small>Not on a day yet</small></div>
          {close}
        </div>
        <Stage id={item.id} grow>
          <ObjectCard item={item} tz={trip.timezone} people={trip.people} open onEdit={() => edit(item.id)} />
        </Stage>
        <div className="df">
          <button
            className="btn-soft flex-1"
            disabled={!slot}
            onClick={() => {
              if (!slot) return
              select(addBlock({ itemId: item.id, day: onDay, start: slot.start, end: slot.end, locked: item.anchors.some((a) => a.hard) }))
              setDay(onDay)
            }}
          >
            <CalendarPlus size={15} /> {slot ? `Add to ${dayLabel(onDay).split(',')[0]} ${Number(onDay.slice(8))} at ${clock(slot.start)}` : `No slot on ${dayLabel(day)}`}
          </button>
          <button className="btn-soft flex-1" onClick={() => edit(item.id)}><Pencil size={15} /> Edit card</button>
        </div>
      </div>
    )
  }

  const leg = analysis.legs.find((l) => l.toId === b.id)
  const from = leg && trip.blocks.find((x) => x.id === leg.fromId)
  const to = ctx.loc(b)
  const dir = to ? directionsUrl(from ? ctx.loc(from) : undefined, to, leg?.mode ?? trip.defaultMode, mapsApp) : undefined

  return (
    <div className="detail">
      <div className="dh">
        <div className="x"><b>{dayLabel(b.day)}</b><small>{clock(b.start)}–{clock(b.end)}{b.locked && ' · fixed time'}</small></div>
        {close}
      </div>
      <Stage id={b.id}>
        <ObjectCard item={item} block={b} tz={trip.timezone} issues={analysis.issues.get(b.id)} open onEdit={() => edit(item.id)} />
      </Stage>
      <div className="db">
        <BlockDetail id={b.id} analysis={analysis} onLeg={setOpenLeg} card={false} />
      </div>
      <div className="df">
        {dir && <a className="btn-soft flex-1 dir" href={dir} target="_blank" rel="noreferrer" aria-label="Directions" title="Directions"><Navigation size={15} /><span>Directions</span></a>}
        <button className="btn-soft flex-1" onClick={() => { removeBlock(b.id); select(item.id) }}><Undo2 size={15} /> Unschedule</button>
        <button className="btn-soft flex-1" onClick={() => edit(item.id)}><Pencil size={15} /> Edit card</button>
      </div>
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
    </div>
  )
}
