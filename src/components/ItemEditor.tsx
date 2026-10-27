import { useState } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import { hoursError, hoursSummary } from '../lib/hours'
import { searchPlaces, type PlaceHit } from '../lib/places'
import { dayLabel, dayRange, fmtTime, parseHHMM, toHHMM } from '../lib/time'
import { uid, useStore } from '../store'
import type { Anchor, Item, ItemType, LatLng } from '../types'
import { Clock, ExternalLink, Lock, Map as MapIcon, MapPin, Plus, Sun, X } from 'lucide-react'
import { Avatar, cx, Field, InterestPicker, Sheet, TYPE_META } from './ui'

const TZ_CHOICES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'UTC']

export default function ItemEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const { updateItem, deleteItem } = useStore()
  const original = trip.items.find((i) => i.id === id)
  const [d, setD] = useState<Item | undefined>(original)
  if (!original || !d) return null
  const set = (p: Partial<Item>) => setD({ ...d, ...p })
  const days = dayRange(trip.startDay, trip.endDay)
  const herr = hoursError(d.hours)
  const blocks = trip.blocks.filter((b) => b.itemId === id)

  const save = () => {
    updateItem(id, d)
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

        <div>
          <div className="label mb-1.5">How long</div>
          <div className="grid grid-cols-3 gap-2">
            {(['min', 'typical', 'max'] as const).map((k) => (
              <label key={k} className="text-xs t-sub">
                {k === 'typical' ? 'usually' : k} (min)
                <input type="number" min={0} step={5} className="input mt-0.5" value={d.duration[k]} onChange={(e) => set({ duration: { ...d.duration, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!d.prefersDaylight} onChange={(e) => set({ prefersDaylight: e.target.checked })} />
          <Sun size={15} className="t-sub" /> Best while it's light out
        </label>

        <AnchorEditor anchors={d.anchors} days={days} tripTz={trip.timezone} onChange={(anchors) => set({ anchors })} />

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
