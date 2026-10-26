import { useMemo, useRef, useState } from 'react'
import { Avatar, cx, IssueList, Sheet, SEVERITY_STYLE, TYPE_META } from '../components/ui'
import { daylight, hoursSummary, openSpans, openStatus } from '../lib/hours'
import { type DayAnalysis, analyzeDay, anchorOnDay, anchoredSlot, findSlot, interestScore, makeCtx, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration, fmtTime, parseHHMM, snap, toHHMM } from '../lib/time'
import { directionsUrl, fmtDistance, MODE_ICON, MODES } from '../lib/transit'
import { useNow } from '../lib/useNow'
import { itemById, useStore } from '../store'
import type { Block, Item, Trip } from '../types'

const PX = 1.1 // pixels per minute
const GUTTER = 44

export default function PlanView() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const setDay = useStore((s) => s.setDay)
  const days = dayRange(trip.startDay, trip.endDay)
  const analyses = useMemo(() => Object.fromEntries(days.map((d) => [d, analyzeDay(trip, d)])), [trip, days.join()])
  const analysis = analyses[day] ?? analyzeDay(trip, day)
  const [addAt, setAddAt] = useState<number | null>(null)
  const [openBlock, setOpenBlock] = useState<string | null>(null)

  return (
    <div className="pb-6">
      <DayStrip days={days} day={day} setDay={setDay} analyses={analyses} />
      <DaySummary trip={trip} day={day} analysis={analysis} onAdd={() => setAddAt(-1)} />
      <Timeline trip={trip} day={day} analysis={analysis} onEmpty={setAddAt} onOpen={setOpenBlock} />
      {addAt !== null && <AddSheet trip={trip} day={day} at={addAt < 0 ? null : addAt} onClose={() => setAddAt(null)} />}
      {openBlock && <BlockSheet id={openBlock} analysis={analysis} onClose={() => setOpenBlock(null)} />}
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
    <div className="sticky top-0 z-20 flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
      {days.map((d) => {
        const a = analyses[d]
        const sev = worstSeverity([...a.issues.values()].flat().filter((i) => i.severity !== 'info'))
        const [wd, rest] = dayLabel(d).split(', ')
        return (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={cx(
              'relative flex min-w-14 shrink-0 flex-col items-center rounded-lg px-2 py-1 text-xs',
              d === day ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700',
            )}
          >
            <span className="font-medium">{wd}</span>
            <span className="opacity-80">{rest}</span>
            <span className="mt-0.5 flex h-1.5 gap-0.5">
              {a.blocks.slice(0, 6).map((b) => (
                <span key={b.id} className={cx('h-1.5 w-1.5 rounded-full', b.locked ? 'bg-rose-500' : d === day ? 'bg-white/60' : 'bg-slate-400')} />
              ))}
            </span>
            {sev && sev !== 'info' && (
              <span className={cx('absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white', sev === 'error' ? 'bg-rose-500' : 'bg-amber-400')} />
            )}
              </button>
        )
      })}
    </div>
  )
}

function DaySummary({ trip, day, analysis, onAdd }: { trip: Trip; day: string; analysis: DayAnalysis; onAdd: () => void }) {
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  const all = [...analysis.issues.values()].flat()
  const errors = all.filter((i) => i.severity === 'error').length
  const warns = all.filter((i) => i.severity === 'warn').length
  const travel = analysis.legs.reduce((s, l) => s + l.minutes, 0)
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-slate-600">
      <span className="text-sm font-semibold text-slate-900">{dayLabel(day, 'long')}</span>
      {dl && <span className="chip">☀️ {fmtTime(dl.sunrise)}–{fmtTime(dl.sunset)}</span>}
      {travel > 0 && <span className="chip">🚋 {fmtDuration(travel)} travel</span>}
      {errors > 0 && <span className={cx('chip', SEVERITY_STYLE.error)}>⛔ {errors}</span>}
      {warns > 0 && <span className={cx('chip', SEVERITY_STYLE.warn)}>⚠️ {warns}</span>}
      <button className="btn ml-auto px-2.5 py-1.5" onClick={onAdd}>＋ Add</button>
    </div>
  )
}

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

function Timeline({ trip, day, analysis, onEmpty, onOpen }: {
  trip: Trip
  day: string
  analysis: DayAnalysis
  onEmpty: (min: number) => void
  onOpen: (id: string) => void
}) {
  const updateBlock = useStore((s) => s.updateBlock)
  const now = useNow()
  const [drag, setDrag] = useState<Drag | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const blocks = analysis.blocks.map((b) => (drag?.id === b.id ? { ...b, ...drag.cur } : b))
  const first = Math.min(9 * 60, ...blocks.map((b) => b.start - 60))
  const last = Math.max(24 * 60, ...blocks.map((b) => b.end))
  const t0 = Math.floor(first / 60) * 60
  const t1 = Math.ceil(last / 60) * 60
  const y = (m: number) => (m - t0) * PX
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  const cols = columns(blocks)
  const dragItem = drag ? itemById(trip, analysis.blocks.find((b) => b.id === drag.id)!.itemId) : undefined
  const dragSpans = dragItem ? openSpans(dragItem.hours, day) : null

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

  const legByTo = new Map(analysis.legs.map((l) => [l.toId, l]))

  return (
    <div
      ref={ref}
      className="relative mx-3 select-none overflow-hidden rounded-xl border border-slate-200 bg-white"
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
      {/* night */}
      {dl && (
        <>
          <div className="absolute inset-x-0 bg-indigo-950/[0.06]" style={{ top: 0, height: Math.max(0, y(dl.sunrise)) }} />
          <div className="absolute inset-x-0 bg-indigo-950/[0.06]" style={{ top: y(dl.sunset), bottom: 0 }} />
        </>
      )}
      {/* hours of the block being dragged */}
      {dragSpans && (
        <>
          <div className="absolute inset-x-0 top-0 bottom-0 bg-rose-500/[0.07]" style={{ left: GUTTER }} />
          {dragSpans.map(([s, e], i) => (
            <div key={i} className="absolute bg-emerald-400/20" style={{ left: GUTTER, right: 0, top: y(s), height: (e - s) * PX }} />
          ))}
        </>
      )}
      {/* hour grid */}
      {Array.from({ length: (t1 - t0) / 60 + 1 }, (_, i) => t0 + i * 60).map((m) => (
        <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: y(m) }}>
          {m > t0 && <span className="absolute left-1.5 -translate-y-1/2 bg-white/80 px-0.5 text-[10px] text-slate-400">{fmtTime(m)}</span>}
        </div>
      ))}
      {/* now */}
      {now.day === day && now.min >= t0 && now.min <= t1 && (
        <div className="pointer-events-none absolute right-0 z-10 border-t-2 border-rose-500" style={{ top: y(now.min), left: GUTTER - 6 }}>
          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rose-500" />
        </div>
      )}

      {blocks.map((b) => {
        const item = itemById(trip, b.itemId)
        if (!item) return null
        const { col, cols: n } = cols.get(b.id) ?? { col: 0, cols: 1 }
        const leg = legByTo.get(b.id)
        return (
          <div key={b.id}>
            {leg && leg.minutes > 0 && <LegChip trip={trip} leg={leg} top={y(b.start)} gapPx={leg.gap * PX} />}
            <BlockCard
              trip={trip}
              day={day}
              block={b}
              item={item}
              issues={analysis.issues.get(b.id)}
              style={{
                top: y(b.start),
                height: Math.max(22, (b.end - b.start) * PX - 2),
                left: `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${col / n})`,
                width: `calc((100% - ${GUTTER + 6}px) / ${n} - 3px)`,
              }}
              dragging={drag?.id === b.id}
              onOpen={() => onOpen(b.id)}
              onGrab={(e) => begin(e, b, 'move')}
              onResize={(e) => begin(e, b, 'resize')}
            />
          </div>
        )
      })}
    </div>
  )
}

function BlockCard({ trip, day, block: b, item, issues, style, dragging, onOpen, onGrab, onResize }: {
  trip: Trip
  day: string
  block: Block
  item: Item
  issues?: ReturnType<DayAnalysis['issues']['get']>
  style: React.CSSProperties
  dragging: boolean
  onOpen: () => void
  onGrab: (e: React.PointerEvent) => void
  onResize: (e: React.PointerEvent) => void
}) {
  const meta = TYPE_META[item.type]
  const sev = worstSeverity(issues)
  const spans = openSpans(item.hours, day)
  const h = (b.end - b.start) * PX
  const voters = trip.people.filter((p) => item.interest[p.id] === 'must' || item.interest[p.id] === 'yes')
  return (
    <div
      className={cx(
        'absolute z-[5] overflow-hidden rounded-lg border text-xs shadow-sm',
        dragging ? 'z-30 shadow-lg ring-2 ring-slate-900' : '',
        sev === 'error' ? 'border-rose-400' : sev === 'warn' ? 'border-amber-400' : 'border-slate-200',
        item.type === 'area' && 'border-dashed',
      )}
      style={{ ...style, background: meta.color + (b.locked ? '26' : '14') }}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {/* left rail: green where open, red where closed (only when hours are known) */}
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }}>
        {spans && (
          <div className="absolute inset-0 bg-rose-500">
            {spans.map(([s, e], i) => {
              const top = Math.max(0, s - b.start) * PX
              const bottom = Math.min(b.end, e) - b.start
              if (bottom <= 0 || s >= b.end) return null
              return <div key={i} className="absolute inset-x-0 bg-emerald-500" style={{ top, height: bottom * PX - top }} />
            })}
          </div>
        )}
      </div>
      {/* anchors */}
      {item.anchors.map((a) => {
        const t = anchorOnDay(a, day, trip.timezone)
        if (t < b.start || t > b.end) return null
        return (
          <div
            key={a.id}
            className={cx('pointer-events-none absolute left-1 right-0 border-t', a.hard ? 'border-rose-600' : 'border-dashed border-slate-500')}
            style={{ top: (t - b.start) * PX }}
          >
            <span className={cx('absolute right-7 -translate-y-1/2 rounded px-1 text-[10px]', a.hard ? 'bg-rose-600 text-white' : 'bg-white/90 text-slate-600')}>
              {a.label} {fmtTime(t)}
            </span>
          </div>
        )
      })}
      <div className="flex h-full gap-1 py-1 pl-2.5 pr-7">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-medium text-slate-900">
            {b.locked && <span title="Fixed time">🔒</span>}
            <span className="truncate">{meta.icon} {item.title}</span>
          </div>
          {h > 34 && (
            <div className="flex items-center gap-1 truncate text-slate-600">
              {fmtTime(b.start)}–{fmtTime(b.end)}
              {sev && <span>{sev === 'error' ? '⛔' : sev === 'warn' ? '⚠️' : '🌙'}</span>}
              {item.tbd && <span title={item.tbd}>❓</span>}
            </div>
          )}
          {h > 56 && voters.length > 0 && (
            <div className="mt-0.5 flex -space-x-1">
              {voters.map((p) => <Avatar key={p.id} person={p} size={16} />)}
            </div>
          )}
        </div>
      </div>
      {!b.locked && (
        <>
          <div
            className="absolute right-0 top-0 flex h-full w-7 cursor-grab touch-none items-start justify-center pt-1 text-slate-400 active:cursor-grabbing"
            onPointerDown={onGrab}
            onClick={(e) => e.stopPropagation()}
            title="Drag to move"
          >
            ⠿
          </div>
          <div
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
            onPointerDown={onResize}
            onClick={(e) => e.stopPropagation()}
            title="Drag to resize"
          />
        </>
      )}
    </div>
  )
}

function LegChip({ trip, leg, top, gapPx }: { trip: Trip; leg: DayAnalysis['legs'][number]; top: number; gapPx: number }) {
  const updateBlock = useStore((s) => s.updateBlock)
  const to = trip.blocks.find((b) => b.id === leg.toId)
  const fromLoc = itemById(trip, trip.blocks.find((b) => b.id === leg.fromId)?.itemId ?? '')?.location
  const toLoc = to && itemById(trip, to.itemId)?.location
  const cycle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateBlock(leg.toId, { modeIn: MODES[(MODES.indexOf(leg.mode) + 1) % MODES.length] })
  }
  const inGap = gapPx >= 22
  return (
    <div
      className="absolute z-[6] flex items-center gap-1"
      style={{ top: inGap ? top - gapPx / 2 - 10 : top - 10, left: GUTTER + 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={cycle}
        title="Tap to change how you get there"
        className={cx('rounded-full border px-2 py-0.5 text-[11px] shadow-sm', leg.tight ? SEVERITY_STYLE.warn : 'border-slate-200 bg-white text-slate-600')}
      >
        {MODE_ICON[leg.mode]} {leg.minutes}m · {fmtDistance(leg.meters)}
        {leg.tight && ` · gap ${Math.max(0, leg.gap)}m`}
      </button>
      {toLoc && (
        <a className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-sky-700 shadow-sm" href={directionsUrl(fromLoc, toLoc, leg.mode)} target="_blank" rel="noreferrer">
          ↗
        </a>
      )}
    </div>
  )
}

function AddSheet({ trip, day, at, onClose }: { trip: Trip; day: string; at: number | null; onClose: () => void }) {
  const addBlock = useStore((s) => s.addBlock)
  const edit = useStore((s) => s.edit)
  const addItem = useStore((s) => s.addItem)
  const [q, setQ] = useState('')
  const scheduledToday = new Set(trip.blocks.filter((b) => b.day === day).map((b) => b.itemId))

  const ranked = trip.items
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
    <Sheet open onClose={onClose} title={at != null ? `Add at ${fmtTime(at)} · ${dayLabel(day)}` : `Add to ${dayLabel(day)}`}>
      <input className="input mb-3" placeholder="Search ideas or tags…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="space-y-1.5">
        {ranked.map(({ i, slot, status, scheduled }) => (
          <li key={i.id}>
            <button
              disabled={!slot}
              onClick={() => slot && place(i, slot)}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
            >
              <span>{TYPE_META[i.type].icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.title}</span>
                <span className="block truncate text-xs text-slate-500">
                  {slot ? `${fmtTime(slot.start)}–${fmtTime(slot.end)}` : 'No open slot today'}
                  {status === 'closed' && ' · closed then'}
                  {status === 'partial' && ' · partly closed'}
                  {hoursSummary(i.hours, day, fmtTime) && ` · hours ${hoursSummary(i.hours, day, fmtTime)}`}
                  {scheduled.length > 0 && ` · already on ${scheduled.map((b) => dayLabel(b.day).split(',')[0]).join(', ')}`}
                </span>
              </span>
              <span className="text-xs">{Object.values(i.interest).filter((v) => v === 'must').length > 0 && '❤️'}</span>
            </button>
          </li>
        ))}
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
        ＋ New idea{q && ` “${q}”`}
      </button>
    </Sheet>
  )
}

function BlockSheet({ id, analysis, onClose }: { id: string; analysis: DayAnalysis; onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const { updateBlock, removeBlock, edit } = useStore()
  const b = trip.blocks.find((x) => x.id === id)
  const item = b && itemById(trip, b.itemId)
  if (!b || !item) return null
  const ctx = makeCtx(trip)
  const hours = hoursSummary(item.hours, b.day, fmtTime)
  const days = dayRange(trip.startDay, trip.endDay)
  const shift = (m: number) => updateBlock(b.id, { start: b.start + m, end: b.end + m })
  const leg = analysis.legs.find((l) => l.toId === b.id)

  return (
    <Sheet
      open
      onClose={onClose}
      title={<span>{TYPE_META[item.type].icon} {item.title}</span>}
      footer={
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={() => { removeBlock(b.id); onClose() }}>Unschedule</button>
          <button className="btn flex-1" onClick={() => { onClose(); edit(item.id) }}>Edit idea</button>
        </div>
      }
    >
      <div className="space-y-4">
        <IssueList issues={analysis.issues.get(b.id)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Start
            <input type="time" className="input mt-1" value={toHHMM(b.start)} onChange={(e) => {
              const s = parseHHMM(e.target.value)
              if (s != null) updateBlock(b.id, { start: s, end: s + (b.end - b.start) })
            }} />
          </label>
          <label className="text-xs text-slate-500">
            End
            <input type="time" className="input mt-1" value={toHHMM(b.end)} onChange={(e) => {
              let s = parseHHMM(e.target.value)
              if (s == null) return
              if (s <= b.start) s += 1440
              updateBlock(b.id, { end: s })
            }} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[-30, -15, 15, 30, 60].map((m) => (
            <button key={m} className="btn-soft px-2.5 py-1" onClick={() => shift(m)}>{m > 0 ? '+' : '−'}{Math.abs(m)}m</button>
          ))}
          <span className="ml-auto text-xs text-slate-500 self-center">{fmtDuration(b.end - b.start)} (usually {fmtDuration(item.duration.typical)})</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.locked} onChange={(e) => updateBlock(b.id, { locked: e.target.checked })} />
          <span><b>Fixed time</b>: running late never moves this (reservations, tickets)</span>
        </label>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Move to day</div>
          <div className="flex flex-wrap gap-1">
            {days.map((d) => (
              <button key={d} onClick={() => updateBlock(b.id, { day: d })} className={cx('rounded-md px-2 py-1 text-xs', d === b.day ? 'bg-slate-900 text-white' : 'bg-slate-100')}>
                {dayLabel(d).split(',')[0]} {d.slice(8)}
              </button>
            ))}
          </div>
        </div>
        {leg && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Getting here</div>
            <div className="flex flex-wrap items-center gap-1">
              {MODES.map((m) => (
                <button key={m} onClick={() => updateBlock(b.id, { modeIn: m })} className={cx('rounded-md px-2 py-1 text-xs', leg.mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100')}>
                  {MODE_ICON[m]} {m} ~{ctx.travel(trip.blocks.find((x) => x.id === leg.fromId)!, b, m)}m
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1 text-sm text-slate-600">
          {hours && <div>🕘 {hours}{item.hoursSource === 'unverified' && <span className="text-amber-700"> (unverified)</span>}</div>}
          {item.address && <div>📍 {item.address}</div>}
          {item.notes && <div className="whitespace-pre-wrap">{item.notes}</div>}
          {item.tbd && <div className="text-amber-700">❓ {item.tbd}</div>}
        </div>
      </div>
    </Sheet>
  )
}
