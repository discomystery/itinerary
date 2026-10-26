import { useRef, useState } from 'react'
import { Avatar, Field, Segmented } from '../components/ui'
import { helsinkiTrip } from '../data/helsinki'
import { downloadTrip, parseTrip, shareLink } from '../lib/share'
import { MODE_ICON, MODES } from '../lib/transit'
import { useStore } from '../store'
import type { TransitMode } from '../types'

export default function TripView() {
  const trip = useStore((s) => s.trip)
  const { mutate, addPerson, updatePerson, removePerson, replaceTrip } = useStore()
  const [newPerson, setNewPerson] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const set = (p: Partial<typeof trip>) => mutate((t) => ({ ...t, ...p }))

  return (
    <div className="space-y-4 p-3">
      <section className="card space-y-3 p-3">
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
            options={MODES.map((m) => ({ value: m, label: `${MODE_ICON[m]} ${m}` }))}
          />
        </Field>
      </section>

      <section className="card p-3">
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
                <button className="btn-ghost px-2" onClick={() => confirm(`Remove ${p.name} and their votes?`) && removePerson(p.id)}>✕</button>
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

      <section className="card space-y-2 p-3">
        <h2 className="text-sm font-semibold">Share &amp; back up</h2>
        <p className="text-xs text-slate-500">
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
            🔗 Share link
          </button>
          <button className="btn-soft" onClick={() => downloadTrip(trip)}>⬇ Export file</button>
          <button className="btn-soft" onClick={() => file.current?.click()}>⬆ Import file</button>
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
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      </section>

      <section className="card space-y-2 p-3">
        <h2 className="text-sm font-semibold">Start over</h2>
        <button className="btn-soft" onClick={() => confirm('Reset to the Helsinki sample trip? (Undo works.)') && replaceTrip(helsinkiTrip())}>
          Reset to Helsinki sample
        </button>
      </section>
    </div>
  )
}
