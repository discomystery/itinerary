import type { LucideIcon } from 'lucide-react'
import { Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { clock } from './objects'
import { Avatar, cx, Mark, Segmented } from './ui'
import { useRoutes } from '../lib/routeCache'
import { analyzeDay, makeCtx, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { itemById, type Tab, useStore } from '../store'
import IdeasView from '../views/IdeasView'
import MapView from '../views/MapView'

// Chrome for the tablet and desktop layouts. The views themselves are the phone
// views, placed side by side; nothing here changes how a view looks inside.

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

/** Desktop sidebar: the trip, its sections, and every day at a glance. */
export function Sidebar({ tabs }: { tabs: TabDef[] }) {
  const trip = useStore((s) => s.trip)
  const tab = useStore((s) => s.tab)
  const day = useStore((s) => s.day)
  const { setTab, setDay } = useStore()
  const routes = useRoutes((s) => s.routes)
  const days = dayRange(trip.startDay, trip.endDay)
  const analyses = useMemo(() => {
    const ctx = makeCtx(trip, routes)
    return days.map((d) => ({ d, a: analyzeDay(trip, d, ctx) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, routes, days.join()])
  // The map follows the chosen day; other sections open that day's plan.
  const pickDay = (d: string) => {
    setDay(d)
    if (tab !== 'map') setTab('plan')
  }
  const dayed = tab === 'plan' || tab === 'map'

  return (
    <aside className="side">
      <div className="sh">
        <Mark />
        <b title={trip.name}>{trip.name}</b>
        <small>{dayLabel(trip.startDay).split(', ')[1]} – {dayLabel(trip.endDay).split(', ')[1]}</small>
      </div>
      <nav className="snav" aria-label="Sections">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <t.Icon />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="sl sdl"><span>Days</span><span>{days.length}</span></div>
      <div className="sdays">
        {analyses.map(({ d, a }) => {
          const titles = a.blocks.map((b) => itemById(trip, b.itemId)?.title).filter(Boolean)
          const sev = worstSeverity([...a.issues.values()].flat().filter((i) => i.severity !== 'info'))
          const first = a.blocks[0]
          const last = a.blocks[a.blocks.length - 1]
          const [wd] = dayLabel(d).split(',')
          return (
            <button key={d} className={cx(!a.blocks.length && 'free')} onClick={() => pickDay(d)} aria-pressed={dayed && d === day} aria-label={dayLabel(d, 'long')}>
              <span className="dn">
                <small>{wd}</small>
                <b>{Number(d.slice(8))}</b>
              </span>
              <span className="x">
                <b>{titles.length ? titles.slice(0, 2).join(' · ') : 'Free day'}</b>
                <small>
                  {a.blocks.length ? `${a.blocks.length} plan${a.blocks.length > 1 ? 's' : ''} · ${clock(first.start)}–${clock(last.end)}` : 'Nothing planned yet'}
                </small>
              </span>
              {sev ? (
                <span className="dot" style={{ background: sev === 'error' ? '#e11d48' : '#f59e0b' }} title={sev === 'error' ? 'Has a conflict' : 'Has a warning'} />
              ) : a.blocks.some((b) => b.locked) ? (
                <span className={cx('dot', 'hard')} title="Has a fixed time" />
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="sf">
        <WhoAmI />
        <UndoButton />
      </div>
    </aside>
  )
}

type Aside = 'map' | 'ideas'

/** The right-hand pane beside a day's plan: its route on the map, or the ideas pool. */
export function PlanAside() {
  const [show, setShow] = useState<Aside>(() => {
    try {
      return (localStorage.getItem('hub-aside') as Aside) || 'map'
    } catch {
      return 'map'
    }
  })
  const pick = (a: Aside) => {
    setShow(a)
    try {
      localStorage.setItem('hub-aside', a)
    } catch {
      /* private mode */
    }
  }
  return (
    <section className="pane aside" aria-label={show === 'map' ? 'Map' : 'Ideas'}>
      <div className="ash">
        <Segmented value={show} onChange={pick} options={[{ value: 'map', label: 'Map' }, { value: 'ideas', label: 'Ideas' }]} />
      </div>
      <div className={cx('ab', show === 'map' ? 'overflow-hidden' : 'overflow-y-auto')}>
        {show === 'map' ? <MapView embedded /> : <IdeasView />}
      </div>
    </section>
  )
}
