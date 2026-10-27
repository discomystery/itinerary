import { CalendarRange, Columns3, Lock, Plus, TriangleAlert } from 'lucide-react'
import { type CSSProperties, type DragEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { clock, glyphFor, objectKind, ObjectCard } from '../components/objects'
import { LegSheet, MODE_STYLE, railVars } from '../components/rail'
import { Ribbons } from '../components/ribbons'
import { cx, ViewHeader } from '../components/ui'
import { daylight } from '../lib/hours'
import { useFetchRoutes, useRoutes } from '../lib/routeCache'
import { type DayAnalysis, type Leg, analyzeDay, anchoredSlot, findSlot, interestScore, makeCtx, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { ideas, itemById, useStore } from '../store'
import type { Trip } from '../types'
import { AddSheet, columns, ListView } from './PlanView'

// The big-screen Plan: every day of the trip at once. Board (the default) puts each
// day in a column of paper cards with the ideas pool first; Week lays the same plans
// on a real time grid. Picking a card shows it, unfolded, in the details pane.

type Mode = 'board' | 'week'

const DRAG = 'application/x-papermap-item'

export default function BoardView() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const { setDay, select, addBlock } = useStore()
  const routes = useRoutes((s) => s.routes)
  const days = dayRange(trip.startDay, trip.endDay)
  const ctx = useMemo(() => makeCtx(trip, routes), [trip, routes])
  const analyses = useMemo(
    () => Object.fromEntries(days.map((d) => [d, analyzeDay(trip, d, ctx)])) as Record<string, DayAnalysis>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip, ctx, days.join()],
  )
  useFetchRoutes(Object.values(analyses).flatMap((a) => a.missing))
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem('board-mode') === 'week' ? 'week' : 'board'
    } catch {
      return 'board'
    }
  })
  const [addTo, setAddTo] = useState<string | null>(null)
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  const pickMode = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem('board-mode', m)
    } catch {
      /* private mode */
    }
  }
  const pick = (id: string, d?: string) => {
    select(id)
    if (d) setDay(d)
  }
  /** Drop an idea on a day: it lands in that day's first slot that fits, like Add does. */
  const place = (d: string, itemId: string) => {
    const item = itemById(trip, itemId)
    if (!item) return
    const anchored = anchoredSlot(item, trip.timezone)
    // Items with set times only belong on their own day.
    if (anchored && anchored.day !== d) return
    const slot = anchored ?? findSlot(trip, d, item)
    if (!slot) return
    pick(addBlock({ itemId, day: d, start: slot.start, end: slot.end, locked: item.anchors.some((a) => a.hard) }), d)
  }
  const plans = trip.blocks.filter((b) => b.day >= trip.startDay && b.day <= trip.endDay).length

  return (
    <div className="bview flex h-full flex-col">
      <ViewHeader
        title={`${dayLabel(trip.startDay).split(', ')[1]} – ${dayLabel(trip.endDay).split(', ')[1]}`}
        sub={`${days.length} days · ${plans} plans`}
        right={
          <>
            <span className="seg3">
              <button aria-pressed={mode === 'board'} onClick={() => pickMode('board')} title="Board" aria-label="Board"><Columns3 /></button>
              <button aria-pressed={mode === 'week'} onClick={() => pickMode('week')} title="Week" aria-label="Week"><CalendarRange /></button>
            </span>
            <button className="fab" onClick={() => setAddTo(day)} aria-label={`Add to ${dayLabel(day)}`}><Plus /></button>
          </>
        }
      />
      {mode === 'board' ? (
        <Board trip={trip} days={days} analyses={analyses} onPick={pick} onAdd={setAddTo} onLeg={setOpenLeg} onPlace={place} />
      ) : (
        <Week trip={trip} days={days} analyses={analyses} onPick={pick} onAdd={setAddTo} onLeg={setOpenLeg} onPlace={place} />
      )}
      {addTo && <AddSheet trip={trip} day={addTo} at={null} onClose={() => setAddTo(null)} />}
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
    </div>
  )
}

interface PaneProps {
  trip: Trip
  days: string[]
  analyses: Record<string, DayAnalysis>
  onPick: (id: string, day?: string) => void
  onAdd: (day: string) => void
  onLeg: (l: Leg) => void
  onPlace: (day: string, itemId: string) => void
}

/** Drop-target props for a day, highlighting while an idea hovers over it. */
function useDrop(onPlace: (day: string, itemId: string) => void) {
  const [over, setOver] = useState<string | null>(null)
  const props = (d: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG)) return
      e.preventDefault()
      if (over !== d) setOver(d)
    },
    onDragLeave: () => setOver((o) => (o === d ? null : o)),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DRAG)
      setOver(null)
      if (id) onPlace(d, id)
    },
  })
  return { over, props }
}

function Head({ d, a }: { d: string; a: DayAnalysis }) {
  const [wd] = dayLabel(d).split(',')
  const sev = worstSeverity([...a.issues.values()].flat().filter((i) => i.severity !== 'info'))
  const first = a.blocks[0]
  const last = a.blocks[a.blocks.length - 1]
  return (
    <>
      <b>{wd} {Number(d.slice(8))}</b>
      <small>
        {a.blocks.length} plan{a.blocks.length > 1 ? 's' : ''} · {clock(first.start)}–{clock(last.end)}
      </small>
      {sev && <span className="dot" style={{ background: sev === 'error' ? '#e11d48' : '#f59e0b' }} title={sev === 'error' ? 'Has a conflict' : 'Has a warning'} />}
    </>
  )
}

/* ------------------------------- Board -------------------------------- */

function Board({ trip, days, analyses, onPick, onAdd, onLeg, onPlace }: PaneProps) {
  const day = useStore((s) => s.day)
  const selected = useStore((s) => s.selected)
  const { setDay, select } = useStore()
  const { over, props } = useDrop(onPlace)
  const ref = useRef<HTMLDivElement>(null)
  // Open on the current day's column.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.bcol.cur')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // A tap on bare board puts the picked card back.
    <div className="board" ref={ref} onClick={(e) => e.target === e.currentTarget && select(null)}>
      <IdeasColumn trip={trip} onPick={onPick} />
      {days.map((d) => {
        const a = analyses[d]
        const [wd] = dayLabel(d).split(',')
        if (!a.blocks.length) {
          return (
            <button key={d} className={cx('bstrip', over === d && 'over')} onClick={() => onAdd(d)} aria-label={`${dayLabel(d, 'long')}: free. Add a plan`} {...props(d)}>
              <small>{wd}</small>
              <b>{Number(d.slice(8))}</b>
              <span>{over === d ? 'Drop to plan' : 'Free day · add'}</span>
            </button>
          )
        }
        return (
          <section key={d} className={cx('bcol', d === day && 'cur', over === d && 'over')} aria-label={dayLabel(d, 'long')} {...props(d)}>
            <div className="bh">
              <button className="bt" onClick={() => setDay(d)}><Head d={d} a={a} /></button>
              <button className="ib" onClick={() => onAdd(d)} aria-label={`Add to ${dayLabel(d)}`}><Plus /></button>
            </div>
            <div className="bb">
              <Ribbons day={d} />
              <ListView
                trip={trip}
                day={d}
                analysis={a}
                unfolded={null}
                selected={selected ?? ''}
                onToggle={(id) => onPick(id, d)}
                onEdit={(id) => onPick(id, d)}
                onMore={(id) => onPick(id, d)}
                onLeg={onLeg}
                onAdd={() => onAdd(d)}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}

function IdeasColumn({ trip, onPick }: { trip: Trip; onPick: (id: string) => void }) {
  const selected = useStore((s) => s.selected)
  const { edit, addItem } = useStore()
  const planned = new Set(trip.blocks.map((b) => b.itemId))
  const list = ideas(trip)
    .filter((i) => !planned.has(i.id))
    .sort((a, b) => interestScore(b) - interestScore(a) || a.createdAt - b.createdAt)
  return (
    <section className="bcol pool" aria-label="Unplanned ideas">
      <div className="bh">
        <span className="bt"><b>Ideas</b><small>{list.length} unplanned · drag onto a day</small></span>
        <button className="ib" onClick={() => edit(addItem({}))} aria-label="New idea"><Plus /></button>
      </div>
      <div className="bb">
        {list.map((i) => (
          <div
            key={i.id}
            className={cx('pick', selected === i.id && 'sel')}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG, i.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <ObjectCard item={i} tz={trip.timezone} people={trip.people} onClick={() => onPick(i.id)} />
          </div>
        ))}
        {!list.length && <p className="py-8 text-center text-sm t-sub">Every idea is on a day.</p>}
      </div>
    </section>
  )
}

/* -------------------------------- Week -------------------------------- */

const PX = 0.9 // pixels per minute

function Week({ trip, days, analyses, onPick, onAdd, onLeg, onPlace }: PaneProps) {
  const day = useStore((s) => s.day)
  const selected = useStore((s) => s.selected)
  const { over, props } = useDrop(onPlace)
  const all = days.flatMap((d) => analyses[d].blocks)
  const t0 = Math.floor(Math.min(9 * 60, ...all.map((b) => b.start - 30)) / 60) * 60
  const t1 = Math.ceil(Math.max(23 * 60, ...all.map((b) => b.end)) / 60) * 60
  const y = (m: number) => (m - t0) * PX
  const hours = Array.from({ length: (t1 - t0) / 60 + 1 }, (_, i) => t0 + i * 60)

  return (
    <div className="week" style={{ '--days': days.length } as CSSProperties}>
      <div className="wh">
        <span />
        {days.map((d) => {
          const [wd] = dayLabel(d).split(',')
          return (
            <span key={d} className={cx(d === day && 'cur')}>
              <small>{wd}</small>
              <b>{Number(d.slice(8))}</b>
            </span>
          )
        })}
      </div>
      <div className="wb" style={{ height: (t1 - t0) * PX }}>
        <div className="wg">
          {hours.map((m) => m > t0 && <span key={m} style={{ top: y(m) }}>{clock(m).replace(':00', '')}</span>)}
        </div>
        {days.map((d) => {
          const a = analyses[d]
          const dl = daylight(d, trip.center.lat, trip.center.lng, trip.timezone)
          const cols = columns(a.blocks)
          const legByTo = new Map(a.legs.map((l) => [l.toId, l]))
          const pos = (id: string) => {
            const { col, cols: n } = cols.get(id) ?? { col: 0, cols: 1 }
            return { left: `calc(4px + (100% - 8px) * ${col / n})`, width: `calc((100% - 8px) / ${n} - 2px)` }
          }
          return (
            <div key={d} className={cx('cal', 'wc', d === day && 'cur', over === d && 'over')} {...props(d)} onClick={() => onAdd(d)}>
              {hours.map((m) => <div key={m} className="hr" style={{ top: y(m) }} />)}
              {dl && (
                <>
                  <div className="dark" style={{ top: 0, height: Math.max(0, y(dl.sunrise)) }} />
                  <div className="dark" style={{ top: y(dl.sunset), bottom: 0 }} />
                </>
              )}
              {a.blocks.map((b) => {
                const item = itemById(trip, b.itemId)
                if (!item) return null
                const leg = legByTo.get(b.id)
                const sev = worstSeverity(a.issues.get(b.id)?.filter((i) => i.severity !== 'info'))
                const Glyph = glyphFor(item)
                const M = leg && MODE_STYLE[leg.mode].Icon
                return (
                  <Fragment key={b.id}>
                    {leg && M && leg.minutes > 0 && (
                      <div
                        className={cx('tv', leg.tight && 'tight')}
                        style={{ ...pos(b.id), ...railVars(leg.mode), top: y(b.start - leg.minutes), height: Math.max(10, leg.minutes * PX) }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onLeg(leg)
                        }}
                        title={`${leg.minutes} min`}
                      >
                        <M />
                        {leg.minutes * PX > 14 && `${leg.minutes}m`}
                      </div>
                    )}
                    <button
                      type="button"
                      className={cx('ce', objectKind(item), sev === 'error' && 'err', sev === 'warn' && 'warn', selected === b.id && 'sel')}
                      style={{ ...pos(b.id), top: y(b.start), height: Math.max(20, (b.end - b.start) * PX - 2), paddingRight: 6, textAlign: 'left' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPick(b.id, d)
                      }}
                    >
                      <span className="tt">
                        {b.locked ? <Lock /> : sev ? <TriangleAlert style={{ color: sev === 'error' ? '#c8102e' : '#b45309' }} /> : <Glyph />}
                        {item.title}
                      </span>
                      {(b.end - b.start) * PX > 32 && <span className="tm block">{clock(b.start)}–{clock(b.end)}</span>}
                    </button>
                  </Fragment>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
