import type { LucideIcon } from 'lucide-react'
import { Navigation, Pencil, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { clock } from './objects'
import { LegSheet } from './rail'
import { Avatar, cx, Mark, Segmented } from './ui'
import { useRoutes } from '../lib/routeCache'
import { analyzeDay, type Leg, makeCtx, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { directionsUrl } from '../lib/transit'
import { itemById, type Tab, useStore } from '../store'
import IdeasView from '../views/IdeasView'
import { BlockDetail, useShownBlock } from '../views/PlanView'

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

/** The details pane beside a day's plan: the picked plan in full, like its sheet on a phone. */
export function DetailPane() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const mapsApp = useStore((s) => s.mapsApp)
  const { removeBlock, edit } = useStore()
  const routes = useRoutes((s) => s.routes)
  const ctx = useMemo(() => makeCtx(trip, routes), [trip, routes])
  const analysis = useMemo(() => analyzeDay(trip, day, ctx), [trip, day, ctx])
  const id = useShownBlock(analysis)
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  const b = id ? trip.blocks.find((x) => x.id === id) : undefined
  const item = b && itemById(trip, b.itemId)

  if (!b || !item) {
    return (
      <div className="dempty">
        <b>Nothing planned for {dayLabel(day, 'long')}</b>
        <small>Add a plan, then tap it to see its details here.</small>
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
        <b>{item.title}</b>
        <small>{dayLabel(b.day)} · {clock(b.start)}–{clock(b.end)}</small>
      </div>
      <div className="db">
        <BlockDetail id={b.id} analysis={analysis} onLeg={setOpenLeg} />
      </div>
      <div className="df">
        {dir && <a className="btn-soft flex-1 dir" href={dir} target="_blank" rel="noreferrer" aria-label="Directions" title="Directions"><Navigation size={15} /><span>Directions</span></a>}
        <button className="btn-soft flex-1" onClick={() => removeBlock(b.id)}><Undo2 size={15} /> Unschedule</button>
        <button className="btn-soft flex-1" onClick={() => edit(item.id)}><Pencil size={15} /> Edit card</button>
      </div>
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
    </div>
  )
}

type Aside = 'details' | 'ideas'

/** The right-hand pane beside a day's plan on desk: the picked plan's details, or the ideas pool. */
export function PlanAside() {
  const [show, setShow] = useState<Aside>(() => {
    try {
      return localStorage.getItem('hub-aside') === 'ideas' ? 'ideas' : 'details'
    } catch {
      return 'details'
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
    <section className="pane aside" aria-label={show === 'details' ? 'Details' : 'Ideas'}>
      <div className="ash">
        <Segmented value={show} onChange={pick} options={[{ value: 'details', label: 'Details' }, { value: 'ideas', label: 'Ideas' }]} />
      </div>
      <div className="ab overflow-y-auto">
        {show === 'details' ? <DetailPane /> : <IdeasView />}
      </div>
    </section>
  )
}
