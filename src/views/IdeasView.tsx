import { CalendarPlus, ClipboardList, Heart, Plus, Search } from 'lucide-react'
import { InboxBanner, InboxReview, PasteSheet } from '../components/inbox'
import { useState } from 'react'
import { clock, ObjectCard } from '../components/objects'
import { INTEREST_META, INTERESTS, Sheet } from '../components/ui'
import { hoursSummary } from '../lib/hours'
import { anchoredSlot, findSlot, interestScore } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration } from '../lib/time'
import { ideas, useStore } from '../store'
import type { Interest, Item, Trip } from '../types'

type Filter = 'all' | 'unscheduled' | 'must' | 'everyone' | 'needsVote' | 'tbd'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unscheduled', label: 'Not planned' },
  { id: 'must', label: 'Must-dos' },
  { id: 'everyone', label: 'Everyone’s in' },
  { id: 'needsVote', label: 'Needs my vote' },
  { id: 'tbd', label: 'Needs details' },
]

export default function IdeasView() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const { setInterest, edit, addItem } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [scheduling, setScheduling] = useState<Item | null>(null)
  const [pasting, setPasting] = useState(false)
  const [reviewing, setReviewing] = useState(false)

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
  const items = ideas(trip)
    .filter(keep)
    .filter((i) => !ql || i.title.toLowerCase().includes(ql) || i.tags.some((t) => t.includes(ql)) || i.notes?.toLowerCase().includes(ql))
    .sort((a, b) => interestScore(b) - interestScore(a) || a.createdAt - b.createdAt)

  return (
    <div className="flex flex-col gap-3 px-3 pb-8 pt-3">
      <div className="flex items-end justify-between px-1">
        <div className="text-[28px] font-bold leading-tight tracking-tight">Ideas</div>
        <span className="mb-1 font-mono text-xs t-sub">{ideas(trip).length} ideas</span>
      </div>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 t-sub" />
          <input className="input pl-9" placeholder="Search ideas, tags, notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn-soft shrink-0 px-3" onClick={() => setPasting(true)} aria-label="Paste a list" title="Paste a list"><ClipboardList size={16} /> List</button>
        <button className="btn shrink-0 px-3" onClick={() => edit(addItem({}))}><Plus size={16} /> Idea</button>
      </div>
      <InboxBanner onReview={() => setReviewing(true)} />
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className="shrink-0 rounded-full px-3 py-1 text-[13px] font-medium"
            style={filter === f.id ? { background: 'var(--ink)', color: 'var(--chrome)' } : { background: 'var(--chrome)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((i) => (
          <Tile key={i.id} trip={trip} item={i} vote={i.interest[viewer]} onVote={(v) => setInterest(i.id, viewer, v)} onOpen={() => edit(i.id)} onSchedule={() => setScheduling(i)} />
        ))}
      </div>
      {!items.length && <p className="py-8 text-center text-sm t-sub">Nothing here.</p>}
      {scheduling && <ScheduleSheet trip={trip} item={scheduling} onClose={() => setScheduling(null)} />}
      {pasting && <PasteSheet onClose={() => setPasting(false)} onAdded={() => setReviewing(true)} />}
      {reviewing && (
        <InboxReview
          onClose={() => setReviewing(false)}
          onEdit={(id) => {
            setReviewing(false)
            edit(id)
          }}
        />
      )}
    </div>
  )
}

const nextVote = (v?: Interest): Interest | null => {
  if (!v) return 'must'
  const i = INTERESTS.indexOf(v)
  return i === INTERESTS.length - 1 ? null : INTERESTS[i + 1]
}

function Tile({ trip, item: i, vote, onVote, onOpen, onSchedule }: {
  trip: Trip
  item: Item
  vote?: Interest
  onVote: (v: Interest | null) => void
  onOpen: () => void
  onSchedule: () => void
}) {
  const blocks = trip.blocks.filter((b) => b.itemId === i.id).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
  const V = vote ? INTEREST_META[vote] : null
  const when = blocks[0] ? `${dayLabel(blocks[0].day).split(',')[0]} ${clock(blocks[0].start)}` : null
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="cursor-pointer">
      <ObjectCard
        item={i}
        size="t"
        tz={trip.timezone}
        people={trip.people}
        eyebrow={undefined}
        sig={
          <>
            <span className="font-mono text-[11px] font-semibold" style={{ opacity: when ? 1 : 0.55 }}>
              {when ?? 'Not planned'}{blocks.length > 1 && ` +${blocks.length - 1}`}
            </span>
            <span className="flex gap-1">
              <button
                className="grid h-7 w-7 place-items-center rounded-full"
                style={{ background: V ? V.color : 'transparent', color: V ? '#fff' : 'currentColor', boxShadow: V ? 'none' : 'inset 0 0 0 1px currentColor', opacity: V ? 1 : 0.6 }}
                onClick={(e) => { e.stopPropagation(); onVote(nextVote(vote)) }}
                aria-label={V ? `Your vote: ${V.label}. Tap to change` : 'Vote'}
                title={V ? V.label : 'Tap to vote'}
              >
                {V ? <V.Icon size={14} fill={vote === 'must' ? 'currentColor' : 'none'} /> : <Heart size={14} />}
              </button>
              {i.type !== 'note' && (
                <button
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ boxShadow: 'inset 0 0 0 1px currentColor', opacity: 0.6 }}
                  onClick={(e) => { e.stopPropagation(); onSchedule() }}
                  aria-label="Add to a day"
                >
                  <CalendarPlus size={14} />
                </button>
              )}
            </span>
          </>
        }
      />
    </div>
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
    <Sheet open onClose={onClose} title={`Add ${item.title}`}>
      {anchored && (
        <button className="btn mb-3 w-full" onClick={() => go(anchored.day, anchored)}>
          At its set time: {dayLabel(anchored.day)}, {clock(anchored.start)}
        </button>
      )}
      <p className="mb-2 text-xs t-sub">First open gap each day that fits ~{fmtDuration(item.duration.typical)} and the opening hours:</p>
      <ul className="flex flex-col gap-1.5">
        {days.map((d) => {
          const slot = findSlot(trip, d, item)
          const hours = hoursSummary(item.hours, d, clock)
          return (
            <li key={d}>
              <button disabled={!slot} onClick={() => slot && go(d, slot)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm disabled:opacity-40" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                <span className="font-semibold">{dayLabel(d)}</span>
                <span className="font-mono text-xs t-sub">
                  {slot ? `${clock(slot.start)}–${clock(slot.end)}` : 'no room'}
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
