import { CalendarDays, CalendarPlus, ClipboardList, Heart, Plus, Search, Users } from 'lucide-react'
import { InboxBanner, InboxReview, PasteSheet } from '../components/inbox'
import { useCallback, useRef, useState } from 'react'
import { clock, defaultEyebrow, glyphFor, objectKind } from '../components/objects'
import { cx, INTEREST_META, Sheet, ViewHeader, Votes } from '../components/ui'
import { VoteTray, VotesSheet } from '../components/votes'
import { hoursSummary } from '../lib/hours'
import { anchoredSlot, findSlot, interestScore } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration } from '../lib/time'
import { ideas, inboxItems, useStore } from '../store'
import type { Interest, Item, Trip } from '../types'

type Filter = 'all' | 'unscheduled' | 'must' | 'everyone' | 'needsVote' | 'tbd'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unscheduled', label: 'Unplanned' },
  { id: 'must', label: 'Must-dos' },
  { id: 'everyone', label: 'Everyone’s in' },
  { id: 'needsVote', label: 'To vote' },
  { id: 'tbd', label: 'Needs details' },
]

export default function IdeasView() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const organizer = useStore((s) => s.organizer)
  const { setInterest, edit, addItem } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [scheduling, setScheduling] = useState<Item | null>(null)
  const [pasting, setPasting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [votesFor, setVotesFor] = useState<Item | null>(null)

  const scheduledIds = new Set(trip.blocks.map((b) => b.itemId))
  const keep = (i: Item) => {
    const votes = trip.people.map((p) => i.interest[p.id])
    switch (filter) {
      case 'unscheduled': return !scheduledIds.has(i.id)
      case 'must': return votes.includes('must')
      case 'everyone': return votes.every((v) => v === 'must' || v === 'yes')
      case 'needsVote': return organizer ? votes.some((v) => !v) : !i.interest[viewer]
      case 'tbd': return !!i.tbd
      default: return true
    }
  }
  const ql = q.toLowerCase()
  const items = ideas(trip)
    .filter(keep)
    .filter((i) => !ql || i.title.toLowerCase().includes(ql) || i.tags.some((t) => t.includes(ql)) || i.notes?.toLowerCase().includes(ql))
    .sort((a, b) => interestScore(b) - interestScore(a) || a.createdAt - b.createdAt)

  const inbox = inboxItems(trip).length
  return (
    <div>
      <ViewHeader title="Ideas" sub={`${ideas(trip).length} ideas${inbox ? ` · ${inbox} in the inbox` : ''}`}>
        <div className="search3">
          <label>
            <Search />
            <input placeholder="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ideas" />
          </label>
          <button className="b2 soft" onClick={() => setPasting(true)} title="Paste a list"><ClipboardList /> List</button>
          <button className="b2 pri" onClick={() => edit(addItem({}))}><Plus /> Idea</button>
        </div>
        <div className="chips3">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>{f.label}</button>
          ))}
        </div>
      </ViewHeader>
      <div className="desk">
        <InboxBanner onReview={() => setReviewing(true)} />
        <div className="tiles">
          {items.map((i) => (
            <Tile
              key={i.id} trip={trip} item={i} vote={i.interest[viewer]} onVote={(v) => setInterest(i.id, viewer, v)}
              onGroup={organizer ? () => setVotesFor(i) : undefined} onOpen={() => edit(i.id)} onSchedule={() => setScheduling(i)}
            />
          ))}
        </div>
        {!items.length && <p className="py-8 text-center text-sm t-sub">Nothing here.</p>}
      </div>
      {scheduling && <ScheduleSheet trip={trip} item={scheduling} onClose={() => setScheduling(null)} />}
      {votesFor && <VotesSheet item={votesFor} onClose={() => setVotesFor(null)} />}
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

/** A bold tile at one height: what it is, who's in, your vote, and its slot on the plan. */
/** With `onGroup` (organizer mode) the vote button shows how many have voted and opens everyone's votes. */
function Tile({ trip, item: i, vote, onVote, onGroup, onOpen, onSchedule }: {
  trip: Trip
  item: Item
  vote?: Interest
  onVote: (v: Interest | null) => void
  onGroup?: () => void
  onOpen: () => void
  onSchedule: () => void
}) {
  const blocks = trip.blocks.filter((b) => b.itemId === i.id).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
  const [picking, setPicking] = useState(false)
  const voteBtn = useRef<HTMLButtonElement>(null)
  const closeTray = useCallback(() => setPicking(false), [])
  const V = vote ? INTEREST_META[vote] : null
  const voted = trip.people.filter((p) => i.interest[p.id]).length
  const k = objectKind(i)
  const Glyph = glyphFor(i)
  const first = blocks[0]
  const when = first ? `${Number(first.day.slice(8))} ${dayLabel(first.day).split(' ')[1]} · ${clock(first.start)}${blocks.length > 1 ? ` +${blocks.length - 1}` : ''}` : null
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className={cx('t3', k, k === 'resv' && i.tbd && 'open-resv')}>
      <div className="tb">
        <div className="eb"><Glyph /><span>{i.tbd && k === 'resv' ? 'Not booked' : defaultEyebrow(i).replace(/ · (open till|closed).*/, '')}</span></div>
        <div className="tt">{i.title}</div>
        {k === 'post' && <span className="stp stamp"><i><Glyph /></i></span>}
        <div className="vt">
          <Votes item={i} people={trip.people} />
          {onGroup ? (
            <button
              className={cx('myv grp', voted < trip.people.length && 'todo')}
              onClick={(e) => { e.stopPropagation(); onGroup() }}
              aria-label={`${voted} of ${trip.people.length} have voted. Set votes`}
              title="Set everyone's votes"
            >
              <Users /> {voted}/{trip.people.length}
            </button>
          ) : (
            <button
              ref={voteBtn}
              className={cx('myv', !V && 'none')}
              style={V ? { background: V.color } : undefined}
              onClick={(e) => { e.stopPropagation(); setPicking(!picking) }}
              aria-label={V ? `Your vote: ${V.label}. Change it` : 'Vote'}
              aria-expanded={picking}
              title={V ? V.label : 'Vote'}
            >
              {V ? <V.Icon fill={vote === 'must' ? 'currentColor' : 'none'} /> : <Heart />}
            </button>
          )}
        </div>
        {picking && <VoteTray value={vote} onPick={onVote} onClose={closeTray} toggle={voteBtn} />}
      </div>
      {when ? (
        <button className="tf2b" onClick={(e) => { e.stopPropagation(); onSchedule() }} aria-label={`On the plan ${when}. Add another time`}><CalendarDays /><span>{when}</span></button>
      ) : k !== 'note' ? (
        <button className="tf2b add" onClick={(e) => { e.stopPropagation(); onSchedule() }}><CalendarPlus /><span>Add to a day</span></button>
      ) : (
        <div className="tf2b"><span>{i.tbd ?? 'To-do'}</span></div>
      )}
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
