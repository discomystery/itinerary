import { useState } from 'react'
import { cx, InterestDots, InterestPicker, Sheet, TYPE_META } from '../components/ui'
import { hoursSummary } from '../lib/hours'
import { anchoredSlot, findSlot, interestScore } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration, fmtTime } from '../lib/time'
import { useStore } from '../store'
import type { Item, Trip } from '../types'

type Filter = 'all' | 'unscheduled' | 'must' | 'everyone' | 'needsVote' | 'tbd'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unscheduled', label: 'Not scheduled' },
  { id: 'must', label: '❤️ Must-dos' },
  { id: 'everyone', label: '🤝 Everyone’s in' },
  { id: 'needsVote', label: '🗳️ Needs my vote' },
  { id: 'tbd', label: '❓ Needs details' },
]

export default function IdeasView() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const day = useStore((s) => s.day)
  const { setInterest, edit, addItem } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [scheduling, setScheduling] = useState<Item | null>(null)

  const scheduledIds = new Set(trip.blocks.map((b) => b.itemId))
  const keep = (i: Item) => {
    const votes = trip.people.map((p) => i.interest[p.id])
    switch (filter) {
      case 'unscheduled': return !scheduledIds.has(i.id)
      case 'must': return votes.includes('must')
      case 'everyone': return votes.every((v) => v === 'must' || v === 'yes')
      case 'needsVote': return !i.interest[viewer]
      case 'tbd': return !!i.tbd
      default: return true
    }
  }
  const ql = q.toLowerCase()
  const items = trip.items
    .filter(keep)
    .filter((i) => !ql || i.title.toLowerCase().includes(ql) || i.tags.some((t) => t.includes(ql)) || i.notes?.toLowerCase().includes(ql))
    .sort((a, b) => interestScore(b) - interestScore(a) || a.createdAt - b.createdAt)

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <input className="input" placeholder="Search ideas, tags, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn shrink-0" onClick={() => edit(addItem({}))}>＋ Idea</button>
      </div>
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cx('shrink-0 rounded-full px-3 py-1 text-sm', filter === f.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200')}>
            {f.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <IdeaCard
            key={i.id}
            trip={trip}
            item={i}
            day={day}
            viewer={viewer}
            onVote={(v) => setInterest(i.id, viewer, v)}
            onOpen={() => edit(i.id)}
            onSchedule={() => setScheduling(i)}
          />
        ))}
        {!items.length && <li className="py-8 text-center text-sm text-slate-500">Nothing here.</li>}
      </ul>
      {scheduling && <ScheduleSheet trip={trip} item={scheduling} onClose={() => setScheduling(null)} />}
    </div>
  )
}

function IdeaCard({ trip, item: i, day, viewer, onVote, onOpen, onSchedule }: {
  trip: Trip
  item: Item
  day: string
  viewer: string
  onVote: (v: Item['interest'][string] | null) => void
  onOpen: () => void
  onSchedule: () => void
}) {
  const blocks = trip.blocks.filter((b) => b.itemId === i.id).sort((a, b) => a.day.localeCompare(b.day))
  const hours = hoursSummary(i.hours, day, fmtTime)
  return (
    <li className="card p-3" onClick={onOpen}>
      <div className="flex items-start gap-2">
        <span className="text-xl leading-6">{TYPE_META[i.type].icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{i.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>~{fmtDuration(i.duration.typical)}</span>
            {hours && <span>🕘 {dayLabel(day).split(',')[0]} {hours}{i.hoursSource === 'unverified' && '*'}</span>}
            {i.prefersDaylight && <span>☀️ daylight</span>}
            {i.anchors.map((a) => <span key={a.id}>{a.hard ? '🔒' : '◌'} {a.label} {dayLabel(a.day).split(',')[0]} {fmtTime(a.time)}</span>)}
            {i.tags.map((t) => <span key={t}>#{t}</span>)}
          </div>
          {i.tbd && <div className="mt-1 text-xs text-amber-700">❓ {i.tbd}</div>}
          <div className="mt-1.5"><InterestDots item={i} people={trip.people} /></div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <InterestPicker size="sm" value={i.interest[viewer]} onChange={onVote} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {blocks.map((b) => (
            <span key={b.id} className="chip">{dayLabel(b.day).split(',')[0]} {fmtTime(b.start)}</span>
          ))}
          {i.type !== 'note' && (
            <button className="btn-soft px-2.5 py-1" onClick={onSchedule}>
              {blocks.length ? '＋' : 'Schedule'}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function ScheduleSheet({ trip, item, onClose }: { trip: Trip; item: Item; onClose: () => void }) {
  const { addBlock, setDay, setTab } = useStore()
  const anchored = anchoredSlot(item, trip.timezone)
  const days = dayRange(trip.startDay, trip.endDay)
  const go = (day: string, slot: { start: number; end: number }) => {
    addBlock({ itemId: item.id, day, ...slot, locked: item.anchors.some((a) => a.hard) })
    setDay(day)
    setTab('plan')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`Schedule ${item.title}`}>
      {anchored && (
        <button className="btn mb-3 w-full" onClick={() => go(anchored.day, anchored)}>
          At its set time: {dayLabel(anchored.day)}, {fmtTime(anchored.start)}–{fmtTime(anchored.end)}
        </button>
      )}
      <p className="mb-2 text-xs text-slate-500">First open gap each day that fits ~{fmtDuration(item.duration.typical)} and the place's hours:</p>
      <ul className="space-y-1.5">
        {days.map((d) => {
          const slot = findSlot(trip, d, item)
          const hours = hoursSummary(item.hours, d, fmtTime)
          return (
            <li key={d}>
              <button disabled={!slot} onClick={() => slot && go(d, slot)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
                <span className="font-medium">{dayLabel(d)}</span>
                <span className="text-xs text-slate-500">
                  {slot ? `${fmtTime(slot.start)}–${fmtTime(slot.end)}` : 'no room'}
                  {hours && ` · ${hours}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
