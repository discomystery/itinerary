import { useState } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import { hoursError, hoursSummary } from '../lib/hours'
import { searchPlaces, type PlaceHit } from '../lib/places'
import { applyLegs, airport, flightIssues, flightSpan, layovers } from '../lib/flights'
import { addDays, dayLabel, dayRange, fmtDuration, fmtTime, parseHHMM, toHHMM } from '../lib/time'
import { uid, useStore } from '../store'
import type { Anchor, FlightLeg, Item, ItemType, LatLng } from '../types'
import { Clock, ExternalLink, Lock, Map as MapIcon, MapPin, Plus, Sun, X } from 'lucide-react'
import { objectKind } from './objects'
import { Avatar, cx, Field, InterestPicker, Sheet, TYPE_META } from './ui'

const TZ_CHOICES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'UTC']

export default function ItemEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const { updateItem, updateBlock, deleteItem } = useStore()
  const original = trip.items.find((i) => i.id === id)
  const [d, setD] = useState<Item | undefined>(original)
  if (!original || !d) return null
  const set = (p: Partial<Item>) => setD({ ...d, ...p })
  const days = dayRange(trip.startDay, trip.endDay)
  const herr = hoursError(d.hours)
  const blocks = trip.blocks.filter((b) => b.itemId === id)

  const isPass = d.type === 'transport' && objectKind(d) === 'pass'

  const save = () => {
    const legs = isPass && d.legs?.length ? d.legs : undefined
    const next = legs || original.legs ? { ...d, ...applyLegs(d, legs ?? [], trip.timezone) } : d
    updateItem(id, next)
    // A flight's slot follows its legs.
    if (legs) {
      const span = flightSpan(legs, trip.timezone)
      for (const b of blocks) updateBlock(b.id, span)
    }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={original.title}
      footer={
        <div className="flex gap-2">
          <button
            className="btn-ghost" style={{ color: '#c8102e' }}
            onClick={() => {
              if (confirm(`Delete “${original.title}”${blocks.length ? ` and its ${blocks.length} scheduled slot(s)` : ''}?`)) {
                deleteItem(id)
                onClose()
              }
            }}
          >
            Delete
          </button>
          <button className="btn-soft ml-auto" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <div className="flex flex-wrap gap-1">
          {(Object.keys(TYPE_META) as ItemType[]).map((t) => {
            const M = TYPE_META[t]
            const on = d.type === t
            return (
              <button key={t} onClick={() => set({ type: t })} aria-pressed={on} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={on ? { background: 'var(--ink)', color: 'var(--chrome)' } : { boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                <M.Icon size={13} /> {M.label}
              </button>
            )
          })}
        </div>

        <div>
          <div className="label mb-1.5">Who's interested</div>
          <ul className="space-y-1.5">
            {trip.people.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Avatar person={p} />
                <span className="flex-1 text-sm">{p.name}</span>
                <InterestPicker size="sm" value={d.interest[p.id]} onChange={(v) => {
                  const interest = { ...d.interest }
                  if (v) interest[p.id] = v
                  else delete interest[p.id]
                  set({ interest })
                }} />
              </li>
            ))}
          </ul>
        </div>

        {d.type !== 'note' && <LocationPicker item={d} center={trip.center} onChange={set} />}

        {d.type === 'area' && (
          <Field label={`Area size: ~${d.areaRadius ?? 400} m radius`}>
            <input type="range" min={100} max={2000} step={50} className="w-full" value={d.areaRadius ?? 400} onChange={(e) => set({ areaRadius: Number(e.target.value) })} />
          </Field>
        )}

        <Field
          label="Opening hours"
          hint={
            herr ? <span style={{ color: '#c8102e' }}>Can't read that: {herr}</span> : (
              <>
                OSM format, e.g. <code>Mo-Fr 10:00-18:00; Sa 11:00-16:00; Su off</code>
                {d.hours && (
                  <span className="mt-1 grid grid-cols-2 gap-x-3 font-mono t-sub">
                    {days.map((day) => <span key={day}>{dayLabel(day).split(',')[0]} {day.slice(8)}: {hoursSummary(d.hours, day, fmtTime)}</span>)}
                  </span>
                )}
              </>
            )
          }
        >
          <div className="flex gap-2">
            <input className="input font-mono" value={d.hours ?? ''} placeholder="(unknown)" onChange={(e) => set({ hours: e.target.value || undefined, hoursSource: 'manual' })} />
            {d.hoursSource && d.hours && (
              <span className={cx('chip shrink-0 self-center', d.hoursSource === 'unverified' && '!bg-[var(--warn-bg)] !text-[var(--warn-fg)]')}>
                {d.hoursSource === 'osm' ? 'from OSM' : d.hoursSource === 'manual' ? 'manual' : 'unverified'}
              </span>
            )}
          </div>
        </Field>

        {!(isPass && d.legs?.length) && <div>
          <div className="label mb-1.5">How long</div>
          <div className="grid grid-cols-3 gap-2">
            {(['min', 'typical', 'max'] as const).map((k) => (
              <label key={k} className="text-xs t-sub">
                {k === 'typical' ? 'usually' : k} (min)
                <input type="number" min={0} step={5} className="input mt-0.5" value={d.duration[k]} onChange={(e) => set({ duration: { ...d.duration, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </div>}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!d.prefersDaylight} onChange={(e) => set({ prefersDaylight: e.target.checked })} />
          <Sun size={15} className="t-sub" /> Best while it's light out
        </label>

        {isPass && <LegEditor legs={d.legs ?? []} day={d.anchors[0]?.day ?? trip.startDay} tripTz={trip.timezone} onChange={(legs) => set({ legs })} />}
        {!(isPass && d.legs?.length) && (
          <AnchorEditor anchors={d.anchors} days={days} tripTz={trip.timezone} onChange={(anchors) => set({ anchors })} />
        )}

        <Field label="Tags" hint="Comma separated">
          <input className="input" value={d.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })} />
        </Field>
        <Field label="Notes">
          <textarea className="input min-h-20" value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </Field>
        <Field label="Link">
          <input className="input" type="url" value={d.url ?? ''} onChange={(e) => set({ url: e.target.value || undefined })} />
        </Field>
        <Field label="Still needs…" hint="Shown on the plan until someone clears it, e.g. “book tickets”">
          <input className="input" value={d.tbd ?? ''} onChange={(e) => set({ tbd: e.target.value || undefined })} />
        </Field>
        {d.url && <a className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--act)' }} href={d.url} target="_blank" rel="noreferrer">Open link <ExternalLink size={14} /></a>}
      </div>
    </Sheet>
  )
}

function LegEditor({ legs, day, tripTz, onChange }: { legs: FlightLeg[]; day: string; tripTz: string; onChange: (l: FlightLeg[]) => void }) {
  const upd = (id: string, p: Partial<FlightLeg>) => onChange(legs.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const lays = layovers(legs, tripTz)
  const problems = flightIssues(legs, tripTz)
  const add = () => {
    const prev = legs.at(-1)
    const at = prev ? { day: prev.arrive.day, time: prev.arrive.time + 90 } : { day, time: 9 * 60 }
    const depart = { day: at.time >= 1440 ? addDays(at.day, 1) : at.day, time: at.time % 1440, tz: prev?.arrive.tz }
    const lands = depart.time + 120
    onChange([...legs, { id: uid('leg'), from: prev?.to ?? '', to: '', depart, arrive: { day: lands >= 1440 ? addDays(depart.day, 1) : depart.day, time: lands % 1440 } }])
  }
  return (
    <div>
      <div className="label mb-1.5">Flights</div>
      <p className="mb-2 text-xs t-sub">
        One row per flight, in local airport time. Add another for each connection and the layover is worked out for you.
      </p>
      <ul className="space-y-2">
        {legs.map((l, i) => (
          <li key={l.id} className="space-y-2">
            <div className="panel space-y-1.5 p-2">
              <div className="flex items-center gap-1.5">
                <input className="input w-16 py-1 font-mono uppercase" placeholder="RDU" maxLength={4} value={l.from} onChange={(e) => upd(l.id, { from: e.target.value.toUpperCase() })} aria-label="From airport" />
                <span className="t-sub">→</span>
                <input className="input w-16 py-1 font-mono uppercase" placeholder="JFK" maxLength={4} value={l.to} onChange={(e) => upd(l.id, { to: e.target.value.toUpperCase() })} aria-label="To airport" />
                <input className="input py-1" placeholder="Flight no." value={l.flightNo ?? ''} onChange={(e) => upd(l.id, { flightNo: e.target.value || undefined })} />
                <button className="btn-ghost px-2" onClick={() => onChange(legs.filter((x) => x.id !== l.id))} aria-label="Remove"><X size={16} /></button>
              </div>
              {(['depart', 'arrive'] as const).map((end) => {
                const code = end === 'depart' ? l.from : l.to
                const t = l[end]
                const known = airport(code)
                const set = (p: Partial<FlightLeg['depart']>) => upd(l.id, { [end]: { ...t, ...p } })
                return (
                  <div key={end} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-12 text-xs t-sub">{end === 'depart' ? 'Leaves' : 'Lands'}</span>
                    <input type="date" className="input w-auto py-1" value={t.day} onChange={(e) => e.target.value && set({ day: e.target.value })} />
                    <input type="time" className="input w-auto py-1" value={toHHMM(t.time)} onChange={(e) => {
                      const v = parseHHMM(e.target.value)
                      if (v != null) set({ time: v })
                    }} />
                    {known && !t.tz ? (
                      <span className="text-xs t-sub">{known.city} time</span>
                    ) : (
                      <select className="input w-auto py-1" value={t.tz ?? ''} onChange={(e) => set({ tz: e.target.value || undefined })}>
                        <option value="">{known ? `${known.city} time` : `${tripTz.split('/')[1]} time`}</option>
                        {[...new Set([tripTz, ...TZ_CHOICES, ...(t.tz ? [t.tz] : [])])].map((z) => <option key={z} value={z}>{z.split('/')[1]?.replace('_', ' ') ?? z} time</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              <div className="flex gap-1.5">
                <input className="input py-1" placeholder="Seat" value={l.seat ?? ''} onChange={(e) => upd(l.id, { seat: e.target.value || undefined })} />
                <input className="input py-1" placeholder="Confirmation" value={l.confirmation ?? ''} onChange={(e) => upd(l.id, { confirmation: e.target.value || undefined })} />
              </div>
            </div>
            {lays[i] && (
              <div className={cx('px-2 text-xs', lays[i].tight || lays[i].leaveFrom ? 'warnline' : 't-sub')}>
                {lays[i].minutes < 0 ? 'Next flight leaves before this one lands' : `${fmtDuration(lays[i].minutes)} layover in ${lays[i].at}${lays[i].overnight ? ' (overnight)' : ''}`}
              </div>
            )}
          </li>
        ))}
      </ul>
      {problems.filter((p) => p.severity === 'error').map((p) => <p key={p.message} className="mt-1 text-xs" style={{ color: '#c8102e' }}>{p.message}</p>)}
      <button className="btn-soft mt-2 py-1" onClick={add}>
        <Plus size={14} /> {legs.length ? 'Add a connection' : 'Add flight times'}
      </button>
    </div>
  )
}

function AnchorEditor({ anchors, days, tripTz, onChange }: { anchors: Anchor[]; days: string[]; tripTz: string; onChange: (a: Anchor[]) => void }) {
  const upd = (id: string, p: Partial<Anchor>) => onChange(anchors.map((a) => (a.id === id ? { ...a, ...p } : a)))
  return (
    <div>
      <div className="label mb-1.5">Set times</div>
      <p className="mb-2 text-xs t-sub">
        Moments that matter, like <i>Doors 6:30 (soft)</i> or <i>Puck drop 7:00 (hard)</i>. Hard ones get flagged when you'd miss them.
      </p>
      <ul className="space-y-2">
        {anchors.map((a) => (
          <li key={a.id} className="panel space-y-1.5 p-2">
            <div className="flex gap-1.5">
              <input className="input py-1" value={a.label} onChange={(e) => upd(a.id, { label: e.target.value })} />
              <button className="btn-ghost px-2" onClick={() => onChange(anchors.filter((x) => x.id !== a.id))} aria-label="Remove"><X size={16} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <select className="input w-auto py-1" value={a.day} onChange={(e) => upd(a.id, { day: e.target.value })}>
                {[...new Set([...days, a.day])].sort().map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
              <input type="time" className="input w-auto py-1" value={toHHMM(a.time)} onChange={(e) => {
                const t = parseHHMM(e.target.value)
                if (t != null) upd(a.id, { time: t })
              }} />
              <select className="input w-auto py-1" value={a.tz ?? ''} onChange={(e) => upd(a.id, { tz: e.target.value || undefined })}>
                <option value="">{tripTz.split('/')[1]} time</option>
                {TZ_CHOICES.filter((z) => z !== tripTz).map((z) => <option key={z} value={z}>{z.split('/')[1]?.replace('_', ' ') ?? z} time</option>)}
              </select>
              <button onClick={() => upd(a.id, { hard: !a.hard })} className="rounded-lg px-2.5 py-1 text-xs font-medium" style={a.hard ? { background: '#c8102e', color: '#fff' } : { boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                {a.hard ? <><Lock size={12} className="inline" /> Hard</> : 'Soft'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        className="btn-soft mt-2 py-1"
        onClick={() => onChange([...anchors, { id: uid('a'), label: anchors.length ? 'Starts' : 'Doors', day: anchors.at(-1)?.day ?? days[0], time: anchors.at(-1)?.time ?? 19 * 60, hard: anchors.length > 0 }])}
      >
        <Plus size={14} /> Add a time
      </button>
    </div>
  )
}

function ClickToSet({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

function LocationPicker({ item, center, onChange }: { item: Item; center: LatLng; onChange: (p: Partial<Item>) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PlaceHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    setErr(null)
    try {
      setHits(await searchPlaces(q, center))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (h: PlaceHit) => {
    onChange({
      location: { lat: h.lat, lng: h.lng },
      address: h.address,
      ...(h.hours ? { hours: h.hours, hoursSource: 'osm' as const } : {}),
      ...(h.website && !item.url ? { url: h.website } : {}),
      ...(item.title === 'New idea' ? { title: h.name } : {}),
    })
    setHits(null)
    setQ('')
  }

  const pos = item.location ?? center
  return (
    <div>
      <div className="label mb-1.5">
        {item.type === 'area' ? 'Area' : 'Where'}
      </div>
      {item.location ? (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate"><MapPin size={14} className="flex-none t-sub" /> {item.address ?? `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`}</span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange({ location: undefined, address: undefined })}>Clear</button>
        </div>
      ) : (
        <p className="mb-2 text-xs t-sub">No location yet</p>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search() }}>
        <input className="input" placeholder="Search places (OpenStreetMap)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-soft shrink-0" disabled={busy}>{busy ? '…' : 'Find'}</button>
        <button type="button" className="btn-soft shrink-0" onClick={() => setShowMap(!showMap)} title="Pick on map" aria-label="Pick on map"><MapIcon size={16} /></button>
      </form>
      {err && <p className="mt-1 text-xs" style={{ color: '#c8102e' }}>{err}</p>}
      {hits && (
        <ul className="panel mt-2 divide-y divide-[var(--line)] p-0">
          {hits.map((h, i) => (
            <li key={i}>
              <button className="w-full px-3 py-2 text-left" onClick={() => pick(h)}>
                <div className="text-sm font-medium">{h.name}</div>
                <div className="truncate text-xs t-sub">{h.address}</div>
                {h.hours && <div className="flex items-center gap-1 truncate font-mono text-[11px]" style={{ color: '#15803d' }}><Clock size={11} /> {h.hours}</div>}
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-2 text-sm t-sub">No matches near the trip</li>}
        </ul>
      )}
      {showMap && (
        <div className="mt-2 h-56 overflow-hidden rounded-lg border b-line">
          <MapContainer center={[pos.lat, pos.lng]} zoom={14} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickToSet onPick={(p) => onChange({ location: p, address: undefined })} />
            {item.location && item.type === 'area' && <Circle center={[pos.lat, pos.lng]} radius={item.areaRadius ?? 400} pathOptions={{ dashArray: '6 6' }} />}
            {item.location && <CircleMarker center={[pos.lat, pos.lng]} radius={7} pathOptions={{ color: 'white', fillColor: '#0f172a', fillOpacity: 1 }} />}
          </MapContainer>
          <p className="chrome px-2 py-1 text-xs t-sub">Tap the map to set the spot</p>
        </div>
      )}
    </div>
  )
}
