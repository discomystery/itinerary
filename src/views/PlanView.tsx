import { ArrowRight, CalendarDays, ChevronRight, Clock, Ellipsis, GripVertical, List, Lock, LockOpen, MapPin, Navigation, Pencil, Plus, StickyNote, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { Fragment, type ReactNode, useMemo, useRef, useState } from 'react'
import { clock, glyphFor, objectKind, ObjectCard } from '../components/objects'
import { Horizon, LegPill, LegSheet, leaveAt, MODE_STYLE, RailGap, RailMark, railVars } from '../components/rail'
import { Ribbons } from '../components/ribbons'
import { Weather } from '../components/weather'
import { cx, IssueList, Sheet, ViewHeader, Votes } from '../components/ui'
import { daylight, hoursSummary, openSpans, openStatus } from '../lib/hours'
import { type DayAnalysis, type Leg, analyzeDay, anchorOnDay, anchoredSlot, findSlot, interestScore, makeCtx, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration, parseHHMM, snap, toHHMM } from '../lib/time'
import { directionsUrl } from '../lib/transit'
import { useNow } from '../lib/useNow'
import { useWeather } from '../lib/weather'
import { ideas, itemById, useStore } from '../store'
import type { Block, Item, TransitMode, Trip } from '../types'

const PX = 1.1 // pixels per minute in the Day view
const GUTTER = 42

type Mode = 'list' | 'day'

export default function PlanView() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const setDay = useStore((s) => s.setDay)
  const days = dayRange(trip.startDay, trip.endDay)
  const analyses = useMemo(() => Object.fromEntries(days.map((d) => [d, analyzeDay(trip, d)])), [trip, days.join()])
  const analysis = analyses[day] ?? analyzeDay(trip, day)
  const now = useNow()
  const weather = useWeather(trip)
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return (localStorage.getItem('plan-mode') as Mode) || 'list'
    } catch {
      return 'list'
    }
  })
  const [addAt, setAddAt] = useState<number | null>(null)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [unfolded, setUnfolded] = useState<string | null>(null)
  const [more, setMore] = useState<string | null>(null)
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  const pick = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem('plan-mode', m)
    } catch {
      /* private mode */
    }
  }

  return (
    <div>
      <ViewHeader
        top={<DayStrip days={days} day={day} setDay={setDay} analyses={analyses} />}
        title={dayLabel(day).replace(',', '')}
        sub={weather[day] && <Weather w={weather[day]} />}
        right={
          <>
            <span className="seg3">
              <button aria-pressed={mode === 'list'} onClick={() => pick('list')} title="List" aria-label="List"><List /></button>
              <button aria-pressed={mode === 'day'} onClick={() => pick('day')} title="Day" aria-label="Day"><CalendarDays /></button>
            </span>
            <button className="fab" onClick={() => setAddAt(-1)} aria-label="Add to this day"><Plus /></button>
          </>
        }
      >
        <Horizon trip={trip} day={day} now={now.day === day ? now.min : undefined} />
      </ViewHeader>

      <div className="desk">
        <Ribbons day={day} />
        {mode === 'list' ? (
          <ListView
            trip={trip}
            day={day}
            analysis={analysis}
            unfolded={unfolded}
            onToggle={(id) => setUnfolded(unfolded === id ? null : id)}
            onEdit={setOpenBlock}
            onMore={setMore}
            onLeg={setOpenLeg}
            onAdd={() => setAddAt(-1)}
          />
        ) : (
          <DayView trip={trip} day={day} analysis={analysis} onEmpty={setAddAt} onOpen={setOpenBlock} onLeg={setOpenLeg} />
        )}
      </div>

      {addAt !== null && <AddSheet trip={trip} day={day} at={addAt < 0 ? null : addAt} onClose={() => setAddAt(null)} />}
      {openBlock && <BlockSheet id={openBlock} analysis={analysis} onClose={() => setOpenBlock(null)} onLeg={(l) => { setOpenBlock(null); setOpenLeg(l) }} />}
      {more && <MoreSheet id={more} onClose={() => setMore(null)} onWhen={() => { setOpenBlock(more); setMore(null) }} />}
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
    </div>
  )
}

function DayStrip({ days, day, setDay, analyses }: {
  days: string[]
  day: string
  setDay: (d: string) => void
  analyses: Record<string, DayAnalysis>
}) {
  return (
    <div className="days">
      {days.map((d) => {
        const a = analyses[d]
        const sev = worstSeverity([...a.issues.values()].flat().filter((i) => i.severity !== 'info'))
        const hard = a.blocks.some((b) => b.locked)
        return (
          <button key={d} onClick={() => setDay(d)} aria-pressed={d === day} className={cx(hard && 'hardday', !a.blocks.length && 'none')} aria-label={dayLabel(d, 'long')}>
            {dayLabel(d).slice(0, 1)}
            <b>{Number(d.slice(8))}</b>
            <i />
            {sev && <span className="sev" style={{ background: sev === 'error' ? '#e11d48' : '#f59e0b' }} />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ List view ------------------------------ */

type Row = { key: string; t: number; node: ReactNode; mode?: TransitMode; isLeg?: boolean }

function ListView({ trip, day, analysis, unfolded, onToggle, onEdit, onMore, onLeg, onAdd }: {
  trip: Trip
  day: string
  analysis: DayAnalysis
  unfolded: string | null
  onToggle: (id: string) => void
  onEdit: (id: string) => void
  onMore: (id: string) => void
  onLeg: (l: Leg) => void
  onAdd: () => void
}) {
  const editItem = useStore((s) => s.edit)
  const mapsApp = useStore((s) => s.mapsApp)
  const blocks = analysis.blocks
  const legByTo = new Map(analysis.legs.map((l) => [l.toId, l]))
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  const ctx = makeCtx(trip)

  if (!blocks.length) {
    return (
      <div className="px-4 pt-8 text-center">
        <p className="text-sm t-sub">Nothing planned for {dayLabel(day, 'long')} yet.</p>
        <button className="btn mt-4" onClick={onAdd}><Plus size={16} /> Add a plan</button>
      </div>
    )
  }

  const rows: Row[] = []
  blocks.forEach((b, i) => {
    const item = itemById(trip, b.itemId)
    if (!item) return
    const leg = legByTo.get(b.id)
    const from = leg && trip.blocks.find((x) => x.id === leg.fromId)
    const to = ctx.loc(b)
    const dir = to ? directionsUrl(from ? ctx.loc(from) : undefined, to, leg?.mode ?? trip.defaultMode, mapsApp) : undefined
    const open = unfolded === b.id
    rows.push({
      key: b.id,
      t: b.start,
      node: (
        <ObjectCard
          item={item}
          block={b}
          tz={trip.timezone}
          issues={analysis.issues.get(b.id)}
          open={open}
          onClick={() => onToggle(b.id)}
          onEdit={() => editItem(item.id)}
          strip={
            open && (
              <>
                {dir ? <a href={dir} target="_blank" rel="noreferrer"><Navigation />Directions</a> : <span />}
                <button type="button" onClick={() => onEdit(b.id)}><Pencil />Edit</button>
                <button type="button" onClick={() => onMore(b.id)}><Ellipsis />More</button>
              </>
            )
          }
        />
      ),
    })
    const next = blocks[i + 1]
    if (!next) return
    const nleg = legByTo.get(next.id)
    if (nleg && nleg.minutes > 0) {
      rows.push({ key: `leg-${next.id}`, t: leaveAt(trip, nleg), mode: nleg.mode, isLeg: true, node: <LegPill trip={trip} leg={nleg} onOpen={() => onLeg(nleg)} /> })
    } else {
      rows.push({ key: `gap-${next.id}`, t: next.start, node: <RailGap /> })
    }
  })

  // Sunrise / sunset are labels set on the rail where they fall between plans.
  const marks: { t: number; label: string }[] = dl ? [{ t: dl.sunrise, label: `Sunrise ${clock(dl.sunrise)}` }, { t: dl.sunset, label: `Sunset ${clock(dl.sunset)}` }] : []
  for (const m of marks) {
    const idx = rows.findIndex((r) => r.t > m.t)
    if (idx <= 0) continue
    const near = rows[idx].isLeg ? rows[idx] : rows[idx - 1].isLeg ? rows[idx - 1] : undefined
    rows.splice(idx, 0, { key: `mark-${m.label}`, t: m.t, node: <RailMark label={m.label} mode={near?.mode} /> })
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => <Fragment key={r.key}>{r.node}</Fragment>)}
    </div>
  )
}

/* ------------------------------ Day view ------------------------------- */

/** Greedy column layout so overlapping blocks (e.g. a group split) sit side by side. */
function columns(blocks: Block[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>()
  let cluster: Block[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    const colEnds: number[] = []
    const assigned: [Block, number][] = []
    for (const b of cluster) {
      let c = colEnds.findIndex((e) => e <= b.start)
      if (c < 0) c = colEnds.length
      colEnds[c] = b.end
      assigned.push([b, c])
    }
    for (const [b, c] of assigned) out.set(b.id, { col: c, cols: colEnds.length })
    cluster = []
  }
  for (const b of blocks) {
    if (cluster.length && b.start >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return out
}

interface Drag {
  id: string
  mode: 'move' | 'resize'
  y0: number
  start: number
  end: number
  cur: { start: number; end: number }
}

function DayView({ trip, day, analysis, onEmpty, onOpen, onLeg }: {
  trip: Trip
  day: string
  analysis: DayAnalysis
  onEmpty: (min: number) => void
  onOpen: (id: string) => void
  onLeg: (l: Leg) => void
}) {
  const updateBlock = useStore((s) => s.updateBlock)
  const now = useNow()
  const [drag, setDrag] = useState<Drag | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const blocks = analysis.blocks.map((b) => (drag?.id === b.id ? { ...b, ...drag.cur } : b))
  const first = Math.min(9 * 60, ...blocks.map((b) => b.start - 60))
  const last = Math.max(23 * 60, ...blocks.map((b) => b.end))
  const t0 = Math.floor(first / 60) * 60
  const t1 = Math.ceil(last / 60) * 60
  const y = (m: number) => (m - t0) * PX
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  const cols = columns(blocks)
  const dragItem = drag ? itemById(trip, analysis.blocks.find((b) => b.id === drag.id)!.itemId) : undefined
  const dragSpans = dragItem ? openSpans(dragItem.hours, day) : null
  const legByTo = new Map(analysis.legs.map((l) => [l.toId, l]))

  const begin = (e: React.PointerEvent, b: Block, mode: Drag['mode']) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id: b.id, mode, y0: e.clientY, start: b.start, end: b.end, cur: { start: b.start, end: b.end } })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const dm = snap((e.clientY - drag.y0) / PX)
    const cur =
      drag.mode === 'move'
        ? { start: drag.start + dm, end: drag.end + dm }
        : { start: drag.start, end: Math.max(drag.start + 15, drag.end + dm) }
    if (cur.start !== drag.cur.start || cur.end !== drag.cur.end) setDrag({ ...drag, cur })
  }
  const end = () => {
    if (!drag) return
    if (drag.cur.start !== drag.start || drag.cur.end !== drag.end) updateBlock(drag.id, drag.cur)
    setDrag(null)
  }
  const colStyle = (id: string) => {
    const { col, cols: n } = cols.get(id) ?? { col: 0, cols: 1 }
    return {
      left: `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${col / n})`,
      width: `calc((100% - ${GUTTER + 6}px) / ${n} - 3px)`,
    }
  }

  return (
    <div>
      <div
        ref={ref}
        className="cal chrome overflow-hidden rounded-[10px] border b-line"
        style={{ height: (t1 - t0) * PX }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => {
          if (drag) return
          const rect = ref.current!.getBoundingClientRect()
          onEmpty(snap((e.clientY - rect.top) / PX + t0, 30))
        }}
      >
        {dl && (
          <>
            <div className="dark" style={{ top: 0, height: Math.max(0, y(dl.sunrise)) }} />
            <div className="dark" style={{ top: y(dl.sunset), bottom: 0 }} />
          </>
        )}
        {dragSpans && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-rose-500/[0.07]" style={{ left: GUTTER }} />
            {dragSpans.map(([s, e], i) => (
              <div key={i} className="pointer-events-none absolute right-0 bg-emerald-400/20" style={{ left: GUTTER, top: y(s), height: (e - s) * PX }} />
            ))}
          </>
        )}
        {Array.from({ length: (t1 - t0) / 60 + 1 }, (_, i) => t0 + i * 60).map((m) => (
          <div key={m} className="hr" style={{ top: y(m) }}>
            {m > t0 && <span>{clock(m).replace(':00', '')}</span>}
          </div>
        ))}
        {now.day === day && now.min >= t0 && now.min <= t1 && <div className="nowline" style={{ top: y(now.min), left: GUTTER - 4 }} />}

        {blocks.map((b) => {
          const item = itemById(trip, b.itemId)
          if (!item) return null
          const leg = legByTo.get(b.id)
          const sev = worstSeverity(analysis.issues.get(b.id)?.filter((i) => i.severity !== 'info'))
          const Glyph = glyphFor(item)
          const pos = colStyle(b.id)
          return (
            <Fragment key={b.id}>
              {leg && leg.minutes > 0 && (
                <div
                  className={cx('tv', leg.tight && 'tight')}
                  style={{ ...pos, ...railVars(leg.mode), top: y(b.start - leg.minutes), height: Math.max(12, leg.minutes * PX) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onLeg(leg)
                  }}
                >
                  {(() => {
                    const M = MODE_STYLE[leg.mode].Icon
                    return <M />
                  })()}
                  {leg.minutes} min{leg.minutes * PX > 20 && ` · leave ${clock(b.start - leg.minutes)}`}
                </div>
              )}
              <div
                className={cx('ce', objectKind(item), sev === 'error' && 'err', sev === 'warn' && 'warn', drag?.id === b.id && 'dragging')}
                style={{ ...pos, top: y(b.start), height: Math.max(22, (b.end - b.start) * PX - 2) }}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(b.id)
                }}
              >
                {item.anchors.map((a) => {
                  const t = anchorOnDay(a, day, trip.timezone)
                  if (t < b.start || t > b.end) return null
                  return (
                    <div key={a.id} className={cx('anchor', !a.hard && 'soft')} style={{ top: (t - b.start) * PX }}>
                      {(a.hard || t > b.start) && <span>{a.label} {clock(t)}</span>}
                    </div>
                  )
                })}
                <div className="tt">
                  {b.locked ? <Lock /> : sev ? <TriangleAlert style={{ color: sev === 'error' ? '#c8102e' : '#b45309' }} /> : <Glyph />}
                  {item.title}
                </div>
                {(b.end - b.start) * PX > 34 && <div className="tm">{clock(b.start)}–{clock(b.end)}</div>}
                {!b.locked && (
                  <>
                    <div className="grip" onPointerDown={(e) => begin(e, b, 'move')} onClick={(e) => e.stopPropagation()} title="Drag to move">
                      <GripVertical />
                    </div>
                    <div className="resize" onPointerDown={(e) => begin(e, b, 'resize')} onClick={(e) => e.stopPropagation()} title="Drag to resize" />
                  </>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs t-sub">Tap empty time to add · drag the grip to move</p>
    </div>
  )
}

/* ------------------------------- Sheets -------------------------------- */

function AddSheet({ trip, day, at, onClose }: { trip: Trip; day: string; at: number | null; onClose: () => void }) {
  const addBlock = useStore((s) => s.addBlock)
  const edit = useStore((s) => s.edit)
  const addItem = useStore((s) => s.addItem)
  const [q, setQ] = useState('')
  const scheduledToday = new Set(trip.blocks.filter((b) => b.day === day).map((b) => b.itemId))

  const ranked = ideas(trip)
    .filter((i) => (i.type !== 'transport' || i.location) && i.duration.typical > 0)
    // Items with set times only belong on their own day.
    .filter((i) => !i.anchors.length || anchoredSlot(i, trip.timezone)?.day === day)
    .filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()) || i.tags.some((t) => t.includes(q.toLowerCase())))
    .map((i) => {
      const slot = i.anchors.length
        ? anchoredSlot(i, trip.timezone)
        : at != null ? { start: at, end: at + i.duration.typical } : findSlot(trip, day, i)
      const status = slot ? openStatus(i.hours, day, slot.start, slot.end) : 'closed'
      const scheduled = trip.blocks.filter((b) => b.itemId === i.id)
      const rank = (status === 'open' ? 4 : status === 'unknown' ? 2 : 0) + interestScore(i) - scheduled.length * 10 - (scheduledToday.has(i.id) ? 10 : 0)
      return { i, slot, status, scheduled, rank }
    })
    .sort((a, b) => b.rank - a.rank)

  const place = (i: Item, slot: { start: number; end: number }) => {
    addBlock({ itemId: i.id, day, start: slot.start, end: slot.end, locked: i.anchors.some((a) => a.hard) })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={at != null ? `Add at ${clock(at)}` : `Add to ${dayLabel(day)}`}>
      <input className="input mb-3" placeholder="Search ideas or tags" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="flex flex-col gap-1.5">
        {ranked.map(({ i, slot, status, scheduled }) => {
          const Glyph = glyphFor(i)
          const hours = hoursSummary(i.hours, day, clock)
          return (
            <li key={i.id}>
              <button
                disabled={!slot}
                onClick={() => slot && place(i, slot)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left disabled:opacity-45"
                style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}
              >
                <Glyph size={18} className="flex-none t-sub" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.title}</span>
                  <span className="block truncate font-mono text-[11px] t-sub">
                    {slot ? `${clock(slot.start)}–${clock(slot.end)}` : 'No open slot today'}
                    {status === 'closed' && ' · closed then'}
                    {status === 'partial' && ' · partly closed'}
                    {hours && ` · ${hours}`}
                    {scheduled.length > 0 && ` · on ${scheduled.map((b) => dayLabel(b.day).split(',')[0]).join(', ')}`}
                  </span>
                </span>
                <Votes item={i} people={trip.people} min="must" />
              </button>
            </li>
          )
        })}
      </ul>
      <button
        className="btn-soft mt-3 w-full"
        onClick={() => {
          const id = addItem({ title: q || 'New idea' })
          if (at != null) addBlock({ itemId: id, day, start: at, end: at + 60, locked: false })
          onClose()
          edit(id)
        }}
      >
        <Plus size={16} /> New idea{q && ` “${q}”`}
      </button>
    </Sheet>
  )
}

function BlockSheet({ id, analysis, onClose, onLeg }: { id: string; analysis: DayAnalysis; onClose: () => void; onLeg: (l: Leg) => void }) {
  const trip = useStore((s) => s.trip)
  const { updateBlock, removeBlock, edit } = useStore()
  const b = trip.blocks.find((x) => x.id === id)
  const item = b && itemById(trip, b.itemId)
  if (!b || !item) return null
  const days = dayRange(trip.startDay, trip.endDay)
  const shift = (m: number) => updateBlock(b.id, { start: b.start + m, end: b.end + m })
  const leg = analysis.legs.find((l) => l.toId === b.id)
  const from = leg && itemById(trip, trip.blocks.find((x) => x.id === leg.fromId)?.itemId ?? '')
  const hours = hoursSummary(item.hours, b.day, clock)
  const M = leg ? MODE_STYLE[leg.mode] : null

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.title}
      footer={
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={() => { removeBlock(b.id); onClose() }}><Undo2 size={15} /> Unschedule</button>
          <button className="btn flex-1" onClick={() => { onClose(); edit(item.id) }}><Pencil size={15} /> Edit card</button>
        </div>
      }
    >
      <div className="sheetdesk">
        <ObjectCard item={item} block={b} tz={trip.timezone} open onEdit={() => { onClose(); edit(item.id) }} />
        <IssueList issues={analysis.issues.get(b.id)} />
        <div className="pn">
          <div className="sl" style={{ margin: '0 0 8px' }}><span>When</span><span>{fmtDuration(b.end - b.start)} · usually {fmtDuration(item.duration.typical)}</span></div>
          <div className="when">
            <label>
              <small>Day</small>
              <b>{dayLabel(b.day).split(',')[0]} {Number(b.day.slice(8))}</b>
              <select value={b.day} onChange={(e) => updateBlock(b.id, { day: e.target.value })} aria-label="Day">
                {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
            </label>
            <label>
              <small>Start</small>
              <b>{clock(b.start)}</b>
              <input type="time" value={toHHMM(b.start)} aria-label="Start" onChange={(e) => {
                const s = parseHHMM(e.target.value)
                if (s != null) updateBlock(b.id, { start: s, end: s + (b.end - b.start) })
              }} />
            </label>
            <span className="ar"><ArrowRight /></span>
            <label>
              <small>End</small>
              <b>{clock(b.end)}</b>
              <input type="time" value={toHHMM(b.end)} aria-label="End" onChange={(e) => {
                let s = parseHHMM(e.target.value)
                if (s == null) return
                if (s <= b.start) s += 1440
                updateBlock(b.id, { end: s })
              }} />
            </label>
          </div>
          <div className="nudge">
            <span className="stp2"><button onClick={() => shift(-15)}>−15</button><button onClick={() => shift(15)}>+15</button></span>
            <span className="stp2"><button onClick={() => shift(-60)}>−1h</button><button onClick={() => shift(60)}>+1h</button></span>
            <button
              className="lockb"
              aria-pressed={b.locked}
              onClick={() => updateBlock(b.id, { locked: !b.locked })}
              title={b.locked ? 'Fixed time: running late never moves it. Tap to unlock' : 'Can move when you run late. Tap to fix this time'}
              aria-label={b.locked ? 'Fixed time. Unlock' : 'Lock this time'}
            >
              {b.locked ? <Lock /> : <LockOpen />}
            </button>
          </div>
        </div>
        {leg && M && (
          <div className="pn">
            <div className="sl" style={{ margin: '0 0 8px' }}><span>Getting here</span><span className="truncate pl-2">from {from?.title}</span></div>
            <button className={cx('gh3', leg.tight && 'tight')} style={railVars(leg.mode)} onClick={() => onLeg(leg)}>
              <span className="mi"><M.Icon /></span>
              <span className="x"><b>{M.name} · {leg.minutes} min</b><small>{leg.tight ? `${leg.minutes - Math.max(0, leg.gap)} min short · ` : ''}Leave {clock(b.start - leg.minutes)}</small></span>
              <span className="ch">Change<ChevronRight /></span>
            </button>
          </div>
        )}
        {(hours || item.address || (item.notes && objectKind(item) !== 'post')) && (
          <div className="facts2">
            {hours && <div><Clock /> {hours}{item.hoursSource === 'unverified' && ' (unverified)'}</div>}
            {item.address && <div><MapPin /> {item.address}</div>}
            {item.notes && objectKind(item) !== 'post' && <div><StickyNote /> <span className="whitespace-pre-wrap">{item.notes}</span></div>}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function MoreSheet({ id, onClose, onWhen }: { id: string; onClose: () => void; onWhen: () => void }) {
  const trip = useStore((s) => s.trip)
  const { removeBlock, deleteItem, edit } = useStore()
  const b = trip.blocks.find((x) => x.id === id)
  const item = b && itemById(trip, b.itemId)
  if (!b || !item) return null
  return (
    <Sheet open onClose={onClose} title={item.title}>
      <div className="menu">
        <button onClick={onWhen}><CalendarDays />Change the day or time</button>
        <button onClick={() => { onClose(); edit(item.id) }}><Pencil />Edit the card</button>
        <button onClick={() => { removeBlock(b.id); onClose() }}><Undo2 />Unschedule (keep the idea)</button>
        <button className="danger" onClick={() => { if (confirm(`Delete “${item.title}” from the trip?`)) { deleteItem(item.id); onClose() } }}><Trash2 />Delete the idea</button>
      </div>
    </Sheet>
  )
}
