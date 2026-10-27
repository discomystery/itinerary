import { CalendarPlus, Check, ClipboardPaste, Inbox, Link2, Loader2, MapPinOff, RotateCw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import { parsePaste, type ParsedLine } from '../lib/paste'
import { searchPlaces } from '../lib/places'
import { findSlot } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { distanceMeters } from '../lib/transit'
import { applyMatch } from '../lib/useInboxLookups'
import { inboxItems, useStore } from '../store'
import type { Duration, Item, PlaceMatch } from '../types'
import { clock, glyphFor, ObjectCard } from './objects'
import { InterestPicker, Sheet } from './ui'

/* ----------------------------- Paste a list ----------------------------- */

const EXAMPLE = `Löyly – sauna + a dip in the sea
Café Regatta (cinnamon buns by the water)
Kallio for bars #nightlife
Sat: Hietalahti flea market
https://www.google.com/maps/place/Oodi+Helsinki+Central+Library/@60.1738,24.938,17z`

function defaultDuration(p: ParsedLine): Duration {
  if (p.type === 'event') return { min: 120, typical: 180, max: 240 }
  if (p.type === 'area') return { min: 60, typical: 120, max: 240 }
  if (p.tags.includes('museum')) return { min: 60, typical: 90, max: 150 }
  if (p.tags.includes('sauna')) return { min: 60, typical: 120, max: 150 }
  if (p.tags.includes('nightlife')) return { min: 60, typical: 120, max: 240 }
  return { min: 30, typical: 60, max: 120 }
}

/** A stand-in item so the preview can borrow the real glyphs. */
const asItem = (p: ParsedLine): Item => ({ id: p.raw, title: p.title, type: p.type, tags: p.tags, anchors: [], duration: defaultDuration(p), interest: {}, createdAt: 0 })

export function PasteSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (n: number) => void }) {
  const viewer = useStore((s) => s.viewer)
  const existing = useStore((s) => s.trip.items)
  const addItems = useStore((s) => s.addItems)
  const [text, setText] = useState('')
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const parsed = useMemo(() => parsePaste(text), [text])
  const known = new Set(existing.map((i) => i.title.toLowerCase()))
  const keep = parsed.filter((p) => !dropped.has(p.raw))
  const dupes = keep.filter((p) => known.has(p.title.toLowerCase())).length

  const add = () => {
    addItems(
      keep.map((p) => ({
        title: p.title,
        type: p.type,
        tags: p.tags,
        notes: p.notes,
        url: p.url,
        location: p.location,
        duration: defaultDuration(p),
        interest: {},
        inbox: { raw: p.raw.trim(), lookup: 'pending', weekday: p.weekday, addedBy: viewer },
      })),
    )
    onAdded(keep.length)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Paste a list"
      footer={
        <button className="btn w-full py-3" disabled={!keep.length} onClick={add}>
          <Inbox size={16} /> {keep.length ? `Add ${keep.length} to the Inbox` : 'Add to the Inbox'}
        </button>
      }
    >
      <p className="mb-2 text-sm t-sub">
        One idea per line: a friend's text, your notes, Google Maps links. Each one gets looked up on the map and lands in the Inbox for review.
      </p>
      <textarea
        className="input min-h-36 font-mono text-[13px] leading-relaxed"
        placeholder={EXAMPLE}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDropped(new Set())
        }}
        autoFocus
      />
      <div className="mt-1 flex items-center gap-2">
        {!text && (
          <button className="btn-ghost px-0 text-xs" onClick={() => setText(EXAMPLE)}>Try an example</button>
        )}
        {navigator.clipboard?.readText && !text && (
          <button
            className="btn-ghost px-0 text-xs"
            onClick={() => navigator.clipboard.readText().then(setText).catch(() => {})}
          >
            <ClipboardPaste size={13} /> Paste from clipboard
          </button>
        )}
      </div>

      {parsed.length > 0 && (
        <div className="mt-4">
          <div className="label mb-1.5 flex items-center">
            {keep.length} idea{keep.length === 1 ? '' : 's'} found
            {dupes > 0 && <span className="ml-2 normal-case tracking-normal" style={{ color: '#b45309' }}>· {dupes} already on your list</span>}
          </div>
          <ul className="panel divide-y divide-[var(--line)] p-0">
            {parsed.map((p) => {
              const G = glyphFor(asItem(p))
              const off = dropped.has(p.raw)
              return (
                <li key={p.raw} className="flex items-start gap-2.5 px-3 py-2" style={{ opacity: off ? 0.4 : 1 }}>
                  <G size={16} className="mt-0.5 flex-none t-sub" />
                  <div className="min-w-0 flex-1">
                    <div className={off ? 'truncate text-sm font-semibold line-through' : 'truncate text-sm font-semibold'}>{p.title}</div>
                    <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] t-sub">
                      {p.notes && <span className="max-w-full truncate font-sans">{p.notes}</span>}
                      {p.weekday != null && <span>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.weekday]}</span>}
                      {p.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
                      {p.location && <span className="inline-flex items-center gap-0.5"><Link2 size={11} /> pin from link</span>}
                    </div>
                  </div>
                  <button
                    className="btn-ghost h-7 w-7 p-0"
                    aria-label={off ? 'Include' : 'Leave out'}
                    onClick={() => setDropped((d) => {
                      const n = new Set(d)
                      if (n.has(p.raw)) n.delete(p.raw)
                      else n.add(p.raw)
                      return n
                    })}
                  >
                    {off ? <RotateCw size={14} /> : <X size={15} />}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs t-sub">Tip: a line like “Food:” makes a section, and everything under it gets that tag.</p>
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------ Inbox banner ---------------------------- */

export function InboxBanner({ onReview }: { onReview: () => void }) {
  const trip = useStore((s) => s.trip)
  const items = inboxItems(trip)
  if (!items.length) return null
  const looking = items.filter((i) => i.inbox?.lookup === 'pending').length
  return (
    <button className="panel flex items-center gap-3 text-left" onClick={onReview}>
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full text-white" style={{ background: 'var(--act)' }}>
        <Inbox size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{items.length} new idea{items.length === 1 ? '' : 's'} to review</span>
        <span className="flex items-center gap-1 font-mono text-[11px] t-sub">
          {looking ? (<><Loader2 size={11} className="animate-spin" /> Finding {looking} on the map…</>) : 'Keep, vote, or place each one'}
        </span>
      </span>
      <span className="btn px-3 py-1.5 text-xs">Review</span>
    </button>
  )
}

/* ------------------------------ Review flow ----------------------------- */

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay()

export function InboxReview({ onClose, onEdit }: { onClose: () => void; onEdit: (id: string) => void }) {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const { updateItem, deleteItem, setInterest, addBlock, quietUpdateItem } = useStore()
  const queue = inboxItems(trip)
  const [tally, setTally] = useState({ kept: 0, skipped: 0, placed: 0 })
  const [skipAhead, setSkipAhead] = useState<string[]>([])
  const ordered = [...queue.filter((i) => !skipAhead.includes(i.id)), ...queue.filter((i) => skipAhead.includes(i.id))]
  const item = ordered[0]
  const total = queue.length + tally.kept + tally.skipped

  const keep = (place?: { day: string; start: number; end: number }) => {
    if (!item) return
    if (place) addBlock({ itemId: item.id, day: place.day, start: place.start, end: place.end, locked: false })
    updateItem(item.id, { inbox: undefined })
    setTally((t) => ({ ...t, kept: t.kept + 1, placed: t.placed + (place ? 1 : 0) }))
  }
  const skip = () => {
    if (!item) return
    deleteItem(item.id)
    setTally((t) => ({ ...t, skipped: t.skipped + 1 }))
  }

  return (
    <Sheet open onClose={onClose} title={item ? `Review · ${tally.kept + tally.skipped + 1} of ${total}` : 'Inbox'}>
      {!item ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: '#15803d' }}><Check size={24} /></div>
          <div className="text-lg font-semibold">All caught up</div>
          <p className="mt-1 text-sm t-sub">
            {tally.kept} kept{tally.placed ? ` (${tally.placed} placed on a day)` : ''}, {tally.skipped} skipped.
          </p>
          <button className="btn mt-5" onClick={onClose}>Done</button>
        </div>
      ) : (
        <ReviewCard
          key={item.id}
          item={item}
          vote={item.interest[viewer]}
          onVote={(v) => setInterest(item.id, viewer, v)}
          onKeep={keep}
          onSkip={skip}
          onLater={() => setSkipAhead((s) => [...s.filter((x) => x !== item.id), item.id])}
          onEdit={() => onEdit(item.id)}
          onPick={(m) => quietUpdateItem(item.id, applyMatch({ ...item, url: undefined }, m))}
          onClearPlace={() => quietUpdateItem(item.id, { location: undefined, address: undefined, hours: undefined, hoursSource: undefined })}
          onRetry={() => quietUpdateItem(item.id, { inbox: { ...item.inbox!, lookup: 'pending' } })}
          trip={trip}
          weekdayHint={item.inbox?.weekday}
          weekdayLabel={(d) => WD[d]}
          weekdayOf={weekdayOf}
        />
      )}
    </Sheet>
  )
}

function ReviewCard({ trip, item, vote, onVote, onKeep, onSkip, onLater, onEdit, onPick, onClearPlace, onRetry, weekdayHint, weekdayLabel, weekdayOf }: {
  trip: ReturnType<typeof useStore.getState>['trip']
  item: Item
  vote?: Item['interest'][string]
  onVote: (v: Item['interest'][string] | null) => void
  onKeep: (place?: { day: string; start: number; end: number }) => void
  onSkip: () => void
  onLater: () => void
  onEdit: () => void
  onPick: (m: PlaceMatch) => void
  onClearPlace: () => void
  onRetry: () => void
  weekdayHint?: number
  weekdayLabel: (d: number) => string
  weekdayOf: (day: string) => number
}) {
  const lookup = item.inbox?.lookup
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const [q, setQ] = useState(item.title)
  const [hits, setHits] = useState<PlaceMatch[] | null>(item.inbox?.matches?.length ? item.inbox.matches : null)
  const [busy, setBusy] = useState(false)

  // Where it could go: days where it fits its hours. The day the list
  // mentioned comes first, then days with plans close by.
  const fits = useMemo(() => {
    const out: { day: string; start: number; end: number; near?: string; dist: number; busy: boolean; hinted: boolean }[] = []
    for (const d of dayRange(trip.startDay, trip.endDay)) {
      const s = findSlot(trip, d, item)
      if (!s) continue
      let dist = Infinity
      let near: string | undefined
      if (item.location) {
        for (const b of trip.blocks.filter((x) => x.day === d)) {
          const other = trip.items.find((i) => i.id === b.itemId)
          if (!other?.location) continue
          const m = distanceMeters(item.location, other.location)
          if (m < dist) {
            dist = m
            near = other.title
          }
        }
      }
      const busy = trip.blocks.some((x) => x.day === d)
      out.push({ day: d, ...s, dist, busy, near: dist < 2000 ? near : undefined, hinted: weekdayHint != null && weekdayOf(d) === weekdayHint })
    }
    // The day the list named, then days with plans close by, then days you're
    // already out and about (empty days are often travel days).
    return out.sort((a, b) => Number(b.hinted) - Number(a.hinted) || a.dist - b.dist || Number(b.busy) - Number(a.busy)).slice(0, 3)
  }, [trip, item, weekdayHint, weekdayOf])

  const others = (item.inbox?.matches ?? []).filter((m) => !item.location || m.lat !== item.location.lat || m.lng !== item.location.lng)

  const search = async () => {
    setBusy(true)
    try {
      setHits(await searchPlaces(q, trip.center, { limit: 6 }))
    } catch {
      setHits([])
    } finally {
      setBusy(false)
    }
  }

  const release = () => {
    if (dx > 110) onKeep()
    else if (dx < -110) onSkip()
    setDx(0)
    start.current = null
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="touch-pan-y select-none"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transition: start.current == null ? 'transform .2s' : 'none' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button,a,input')) return
          start.current = e.clientX
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => start.current != null && setDx(e.clientX - start.current)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="relative">
          <ObjectCard item={item} size="l" tz={trip.timezone} detail={item.address ?? (item.location ? 'Pinned from the link' : 'No location yet')}>
            {item.notes && <div className="mt-1 text-[13px] leading-snug" style={{ fontFamily: 'var(--sans)' }}>{item.notes}</div>}
            {item.hours && <div className="mt">Hours: {item.hours}</div>}
          </ObjectCard>
          {dx !== 0 && (
            <span
              className="absolute left-3 top-3 rounded-md px-2 py-0.5 font-mono text-xs font-bold text-white"
              style={{ background: dx > 0 ? '#15803d' : '#c8102e', opacity: Math.min(1, Math.abs(dx) / 110) }}
            >
              {dx > 0 ? 'KEEP' : 'SKIP'}
            </span>
          )}
        </div>
      </div>

      <p className="font-mono text-[11px] t-sub">From your list: “{item.inbox?.raw}”</p>

      {/* the map match */}
      {lookup === 'pending' ? (
        <div className="panel flex items-center gap-2 text-sm t-sub"><Loader2 size={15} className="animate-spin" /> Looking for “{item.title}” on the map…</div>
      ) : item.location ? (
        <div className="panel overflow-hidden p-0">
          <div className="h-32">
            <MapContainer key={`${item.location.lat},${item.location.lng}`} center={[item.location.lat, item.location.lng]} zoom={15} className="h-full w-full" zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} attributionControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <CircleMarker center={[item.location.lat, item.location.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#c8102e', fillOpacity: 1 }} />
            </MapContainer>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate t-sub">{item.address ?? 'Pinned from the link'}</span>
            <button className="btn-ghost h-7 px-2 text-xs" onClick={onClearPlace}>Not it</button>
          </div>
          {others.length > 0 && (
            <div className="border-t b-line px-3 py-2">
              <div className="label mb-1">Other matches</div>
              <div className="flex flex-col gap-1">
                {others.slice(0, 3).map((m, n) => (
                  <button key={n} className="truncate text-left text-xs" style={{ color: 'var(--act)' }} onClick={() => onPick(m)}>
                    {m.name} · <span className="t-sub">{m.address}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="panel">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <MapPinOff size={15} className="t-sub" />
            {lookup === 'error' ? 'Couldn’t reach the map search.' : lookup === 'found' ? 'Pick the right place, or search again.' : 'Not found on the map near your trip.'}
            {lookup === 'error' && <button className="btn-ghost ml-auto h-7 px-2 text-xs" onClick={onRetry}><RotateCw size={13} /> Retry</button>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search() }}>
            <input className="input py-1.5" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the map" />
            <button className="btn-soft shrink-0" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}</button>
          </form>
          {hits && (
            <div className="mt-2 flex flex-col gap-1">
              {hits.map((m, n) => (
                <button key={n} className="truncate text-left text-xs" style={{ color: 'var(--act)' }} onClick={() => onPick(m)}>
                  {m.name} · <span className="t-sub">{m.address}</span>
                </button>
              ))}
              {!hits.length && <span className="text-xs t-sub">No matches. You can keep it without a location (good for areas and to-dos).</span>}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="label mb-1.5">Your vote</div>
        <InterestPicker value={vote} onChange={onVote} />
      </div>

      {fits.length > 0 && (
        <div>
          <div className="label mb-1.5">Keep and place it</div>
          <div className="flex flex-wrap gap-1.5">
            {fits.map((f) => (
              <button key={f.day} className="chip gap-1.5 py-1.5 font-mono" onClick={() => onKeep(f)}>
                <CalendarPlus size={13} /> {dayLabel(f.day).split(',')[0]} {Number(f.day.slice(8))} · {clock(f.start)}
                {f.hinted ? (
                  <span style={{ color: 'var(--act)' }}>· your list said {weekdayLabel(weekdayHint!)}</span>
                ) : f.near ? (
                  <span className="t-sub">· near {f.near.split(/[:(]/)[0].trim()}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2">
        <button className="btn-soft py-3" onClick={onSkip}><Trash2 size={16} /> Skip</button>
        <button className="btn-ghost px-3 text-xs" onClick={onLater}>Later</button>
        <button className="btn py-3" onClick={() => onKeep()}><Check size={16} /> Keep</button>
      </div>
      <button className="btn-ghost self-center text-xs" onClick={onEdit}>Edit details first</button>
      <p className="text-center text-[11px] t-sub">Swipe the card right to keep, left to skip.</p>
    </div>
  )
}
