import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Flame } from 'lucide-react'
import { clock, glyphFor } from '../components/objects'
import { InterestPicker, Segmented, TYPE_META, VoteList } from '../components/ui'
import { hoursSummary } from '../lib/hours'
import { dayBlocks, interestScore } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { MAPS_APP_NAME, placeUrl } from '../lib/transit'
import { ideas, useStore } from '../store'
import type { Item, LatLng } from '../types'

type Show = 'day' | 'all'
type ColorBy = 'type' | 'interest'

function heat(score: number, people: number): string {
  const max = Math.max(1, people * 3)
  const t = Math.max(-1, Math.min(1, score / max))
  if (t <= 0) return '#94a3b8'
  return t > 0.6 ? '#e11d48' : t > 0.25 ? '#f97316' : '#facc15'
}

function FitTo({ points }: { points: LatLng[] }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (!points.length) return
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
    map.fitBounds(b.pad(0.2), { maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

const numIcon = (n: number, color: string) =>
  L.divIcon({ className: '', html: `<div class="num-pin" style="background:${color};width:24px;height:24px">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] })

export default function MapView() {
  const trip = useStore((s) => s.trip)
  const day = useStore((s) => s.day)
  const viewer = useStore((s) => s.viewer)
  const mapsApp = useStore((s) => s.mapsApp)
  const { setDay, setInterest, edit } = useStore()
  const [show, setShow] = useState<Show>('day')
  const [colorBy, setColorBy] = useState<ColorBy>('type')
  const days = dayRange(trip.startDay, trip.endDay)

  const route = useMemo(() => dayBlocks(trip, day).map((b) => ({ b, item: trip.items.find((i) => i.id === b.itemId)! })).filter((x) => x.item?.location), [trip, day])
  const routeIds = new Set(route.map((r) => r.item.id))
  const located = ideas(trip).filter((i) => i.location)
  const others = show === 'all' ? located.filter((i) => !routeIds.has(i.id)) : []
  const color = (i: Item) => (colorBy === 'type' ? TYPE_META[i.type].color : heat(interestScore(i), trip.people.length))
  const fitPoints = (show === 'day' && route.length ? route.map((r) => r.item.location!) : located.map((i) => i.location!))

  const popup = (i: Item) => (
    <Popup>
      <div className="min-w-48 space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold">{(() => { const G = glyphFor(i); return <G size={15} color={TYPE_META[i.type].color} /> })()} {i.title}</div>
        {hoursSummary(i.hours, day, clock) && <div className="font-mono text-[11px] text-[#5a6371]">{dayLabel(day)}: {hoursSummary(i.hours, day, clock)}</div>}
        {i.address && <div className="text-xs text-[#5a6371]">{i.address}</div>}
        <VoteList item={i} people={trip.people} />
        <InterestPicker size="sm" value={i.interest[viewer]} onChange={(v) => setInterest(i.id, viewer, v)} />
        <button className="btn-soft w-full py-1" onClick={() => edit(i.id)}>Open</button>
        {i.location && <a className="block text-center text-xs font-medium" style={{ color: 'var(--act)' }} href={placeUrl(i.title, i.location, mapsApp)} target="_blank" rel="noreferrer">Open in {MAPS_APP_NAME[mapsApp]}</a>}
      </div>
    </Popup>
  )

  return (
    <div className="relative h-full">
      <MapContainer center={[trip.center.lat, trip.center.lng]} zoom={13} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitTo points={fitPoints} />
        {others.map((i) =>
          i.type === 'area' ? (
            <Circle key={i.id} center={[i.location!.lat, i.location!.lng]} radius={i.areaRadius ?? 400} pathOptions={{ color: color(i), dashArray: '6 6', weight: 2, fillOpacity: 0.08 }}>
              <Tooltip>{i.title}</Tooltip>
              {popup(i)}
            </Circle>
          ) : (
            <CircleMarker key={i.id} center={[i.location!.lat, i.location!.lng]} radius={7} pathOptions={{ color: 'white', weight: 2, fillColor: color(i), fillOpacity: 0.9 }}>
              <Tooltip>{i.title}</Tooltip>
              {popup(i)}
            </CircleMarker>
          ),
        )}
        {route.length > 1 && (
          <Polyline positions={route.map((r) => [r.item.location!.lat, r.item.location!.lng])} pathOptions={{ color: '#141a22', weight: 3, opacity: 0.55, dashArray: '2 8', lineCap: 'round' }} />
        )}
        {route.map(({ b, item }, n) => (
          <span key={b.id}>
            {item.type === 'area' && (
              <Circle center={[item.location!.lat, item.location!.lng]} radius={item.areaRadius ?? 400} pathOptions={{ color: color(item), dashArray: '6 6', weight: 2, fillOpacity: 0.1 }} />
            )}
            <Marker position={[item.location!.lat, item.location!.lng]} icon={numIcon(n + 1, b.locked ? '#c8102e' : color(item))}>
              <Tooltip direction="top" offset={[0, -10]}>{clock(b.start)} {item.title}</Tooltip>
              {popup(item)}
            </Marker>
          </span>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-2">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <div className="chrome rounded-lg shadow"><Segmented value={show} onChange={setShow} options={[{ value: 'day', label: 'Day route' }, { value: 'all', label: 'Everything' }]} /></div>
          <div className="chrome rounded-lg shadow"><Segmented value={colorBy} onChange={setColorBy} options={[{ value: 'type', label: 'Kind' }, { value: 'interest', label: <><Flame size={13} /> Interest</> }]} /></div>
        </div>
        <div className="pointer-events-auto flex gap-1 overflow-x-auto">
          {days.map((d) => (
            <button key={d} onClick={() => setDay(d)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium shadow"
              style={d === day ? { background: 'var(--ink)', color: 'var(--chrome)' } : { background: 'var(--chrome)' }}>
              {dayLabel(d)}
            </button>
          ))}
        </div>
      </div>
      {show === 'day' && route.length === 0 && (
        <div className="chrome absolute inset-x-0 bottom-3 z-[500] mx-auto w-fit rounded-lg px-3 py-2 text-sm shadow">Nothing with a location on {dayLabel(day)} yet</div>
      )}
    </div>
  )
}
