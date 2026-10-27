import { useRef, useState } from 'react'
import { Avatar, Field, Segmented } from '../components/ui'
import { helsinkiTrip } from '../data/helsinki'
import { downloadTrip, parseTrip, shareLink } from '../lib/share'
import { Download, Link2, Upload, X } from 'lucide-react'
import { MODE_STYLE } from '../components/rail'
import { MAPS_APP_NAME, MODES, type MapsApp } from '../lib/transit'
import { useStore } from '../store'
import type { TransitMode } from '../types'

export default function TripView() {
  const trip = useStore((s) => s.trip)
  const mapsApp = useStore((s) => s.mapsApp)
  const { mutate, addPerson, updatePerson, removePerson, replaceTrip, setMapsApp } = useStore()
  const [newPerson, setNewPerson] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const set = (p: Partial<typeof trip>) => mutate((t) => ({ ...t, ...p }))

  return (
    <div className="space-y-4 p-3">
      <section className="panel space-y-3">
        <Field label="Trip name">
          <input className="input" value={trip.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <input type="date" className="input" value={trip.startDay} onChange={(e) => e.target.value && set({ startDay: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={trip.endDay} onChange={(e) => e.target.value && set({ endDay: e.target.value })} />
          </Field>
        </div>
        <Field label="Trip timezone" hint="All schedule times are local to the trip.">
          <input className="input" value={trip.timezone} onChange={(e) => set({ timezone: e.target.value })} />
        </Field>
        <Field label="Usually get around by">
          <Segmented<TransitMode>
            value={trip.defaultMode}
            onChange={(defaultMode) => set({ defaultMode })}
            options={MODES.map((m) => { const M = MODE_STYLE[m]; return { value: m, label: <><M.Icon size={14} /> {M.name}</> } })}
          />
        </Field>
        <Field label="Open directions in" hint="Just for this device.">
          <Segmented<MapsApp>
            value={mapsApp}
            onChange={setMapsApp}
            options={(['apple', 'google'] as const).map((a) => ({ value: a, label: MAPS_APP_NAME[a] }))}
          />
        </Field>
      </section>

      <section className="panel">
        <h2 className="mb-2 text-sm font-semibold">People</h2>
        <ul className="space-y-2">
          {trip.people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <label className="relative">
                <Avatar person={p} size={32} />
                <input type="color" className="absolute inset-0 opacity-0" value={p.color} onChange={(e) => updatePerson(p.id, { color: e.target.value })} />
              </label>
              <input className="input" value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} />
              {trip.people.length > 1 && (
                <button className="btn-ghost px-2" onClick={() => confirm(`Remove ${p.name} and their votes?`) && removePerson(p.id)}><X size={16} /></button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (newPerson.trim()) addPerson(newPerson.trim())
            setNewPerson('')
          }}
        >
          <input className="input" placeholder="Add someone…" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
          <button className="btn shrink-0">Add</button>
        </form>
      </section>

      <section className="panel space-y-2">
        <h2 className="text-sm font-semibold">Share &amp; back up</h2>
        <p className="text-xs t-sub">
          This version stores the trip on this device only. To share it, send a link or file. Whoever opens it gets their own copy; live sync comes later.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={async () => {
              const url = await shareLink(trip)
              try {
                if (navigator.share) await navigator.share({ title: trip.name, url })
                else {
                  await navigator.clipboard.writeText(url)
                  setMsg('Link copied')
                }
              } catch {
                await navigator.clipboard?.writeText(url).catch(() => {})
                setMsg('Link copied')
              }
            }}
          >
            <Link2 size={16} /> Share link
          </button>
          <button className="btn-soft" onClick={() => downloadTrip(trip)}><Download size={16} /> Export file</button>
          <button className="btn-soft" onClick={() => file.current?.click()}><Upload size={16} /> Import file</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                replaceTrip(parseTrip(await f.text()))
                setMsg('Imported')
              } catch (err) {
                setMsg(String((err as Error).message))
              }
              e.target.value = ''
            }}
          />
        </div>
        {msg && <p className="text-sm" style={{ color: '#15803d' }}>{msg}</p>}
      </section>

      <section className="panel space-y-2">
        <h2 className="text-sm font-semibold">Start over</h2>
        <button className="btn-soft" onClick={() => confirm('Reset to the Helsinki sample trip? (Undo works.)') && replaceTrip(helsinkiTrip())}>
          Reset to Helsinki sample
        </button>
      </section>
    </div>
  )
}
