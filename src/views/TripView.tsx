import { BookUser, CalendarPlus, ClipboardCheck, Download, Eraser, MapPinned, Link2, Pencil, Plus, Share, ShieldCheck, Stamp, Star, Upload, UserPlus, Wallet, X } from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { MODE_STYLE } from '../components/rail'
import { Avatar, Field, Sheet, ViewHeader } from '../components/ui'
import { helsinkiTrip } from '../data/helsinki'
import { CURRENCIES, currencyOf, fmtMoney, tripCosts } from '../lib/costs'
import { downloadCalendar } from '../lib/ics'
import { downloadTrip, parseTrip, shareLink } from '../lib/share'
import { dayLabel, dayRange, wallToUtc } from '../lib/time'
import { MAPS_APP_NAME, type MapsApp, MODES } from '../lib/transit'
import { useNow } from '../lib/useNow'
import { SAMPLE_ID, uid, useStore } from '../store'
import type { DocKind, TravelDoc, Trip } from '../types'

const DOC_META: Record<DocKind, { label: string; Icon: typeof BookUser; hint: string }> = {
  passport: { label: 'Passport', Icon: BookUser, hint: 'Name and expiry' },
  entry: { label: 'Entry rules', Icon: Stamp, hint: 'Visa, authorization, what to show at the border' },
  insurance: { label: 'Insurance', Icon: ShieldCheck, hint: 'Policy number and emergency phone' },
  loyalty: { label: 'Loyalty', Icon: Star, hint: 'Airline or rail program and number' },
  other: { label: 'Other', Icon: Wallet, hint: '' },
}

const span = (t: Trip) => {
  const a = dayLabel(t.startDay).split(', ')[1]
  const b = dayLabel(t.endDay).split(', ')[1]
  return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a} – ${b}`
}

export default function TripView() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const simNow = useStore((s) => s.simNow)
  const mapsApp = useStore((s) => s.mapsApp)
  const organizer = useStore((s) => s.organizer)
  const { mutate, addPerson, updatePerson, removePerson, replaceTrip, startFresh, setViewer, setOrganizer, setSimNow, setMapsApp } = useStore()
  const now = useNow()
  const [newPerson, setNewPerson] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [doc, setDoc] = useState<TravelDoc | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const set = (p: Partial<Trip>) => mutate((t) => ({ ...t, ...p }))
  const isSample = trip.id === SAMPLE_ID
  const musts = (id: string) => trip.items.filter((i) => i.interest[id] === 'must').length

  const share = async () => {
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
  }

  return (
    <div>
      <ViewHeader title="Trip" sub="Saved on this device" right={<button className="ib" onClick={share} aria-label="Share link"><Share /></button>} />
      <div className="desk">
        <div className="pn tripcard">
          <button className="nm2" onClick={() => setEditing(true)} aria-label="Edit trip name and dates">
            <span>{trip.name}</span>
            <Pencil />
          </button>
          <div className="facts">
            <div><span className="k3">Dates</span><span className="v3">{span(trip)}</span></div>
            <div><span className="k3">Length</span><span className="v3">{dayRange(trip.startDay, trip.endDay).length} days</span></div>
            <div><span className="k3">Times in</span><span className="v3">{trip.timezone.split('/')[1]?.replace('_', ' ') ?? trip.timezone}</span></div>
          </div>
          <div>
            <div className="sl" style={{ margin: '0 0 6px' }}><span>Usually get around by</span></div>
            <div className="modes">
              {MODES.map((m) => {
                const M = MODE_STYLE[m]
                return <button key={m} aria-pressed={trip.defaultMode === m} onClick={() => set({ defaultMode: m })}><M.Icon />{M.name}</button>
              })}
            </div>
          </div>
          <div>
            <div className="sl" style={{ margin: '0 0 6px' }}><span>Open directions in</span><span>This device</span></div>
            <div className="modes" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {(['apple', 'google'] as MapsApp[]).map((a) => (
                <button key={a} aria-pressed={mapsApp === a} onClick={() => setMapsApp(a)}>{MAPS_APP_NAME[a]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="sl"><span>People</span><span>{organizer ? 'You’re the organizer' : 'Votes are cast as you'}</span></div>
        <div className="pn np rows">
          {trip.people.map((p) => (
            <div key={p.id} className="person">
              <label className="relative">
                <Avatar person={p} size={28} />
                <input type="color" className="absolute inset-0 opacity-0" value={p.color} onChange={(e) => updatePerson(p.id, { color: e.target.value })} aria-label={`${p.name}'s color`} />
              </label>
              <span className="x">
                <input value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} aria-label="Name" />
                <small>{musts(p.id)} must-do{musts(p.id) === 1 ? '' : 's'}</small>
              </span>
              {p.id === viewer && !organizer ? <span className="you">You</span> : <button className="sw" onClick={() => setViewer(p.id)}>Vote as</button>}
              {trip.people.length > 1 && p.id !== viewer && (
                <button className="btn-ghost -mr-2 px-1.5" onClick={() => confirm(`Remove ${p.name} and their votes?`) && removePerson(p.id)} aria-label={`Remove ${p.name}`}><X size={15} /></button>
              )}
            </div>
          ))}
          <div className="person">
            <span className="orgmark big"><ClipboardCheck /></span>
            <span className="x">
              <b>Organizer</b>
              <small>Set anyone's votes and who's going</small>
            </span>
            {organizer && <span className="you">On</span>}
            <button className="sw" onClick={() => setOrganizer(!organizer)}>{organizer ? 'Turn off' : 'Turn on'}</button>
          </div>
          <form
            className="person add"
            onSubmit={(e) => {
              e.preventDefault()
              if (newPerson.trim()) addPerson(newPerson.trim())
              setNewPerson('')
            }}
          >
            <UserPlus />
            <input placeholder="Add someone" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} aria-label="Add someone" />
            {newPerson && <button className="sw">Add</button>}
          </form>
        </div>

        <div className="sl"><span>Costs</span><span>What's planned so far</span></div>
        <CostPanel trip={trip} onCurrency={(currency) => set({ currency })} />

        <div className="sl"><span>Travel documents</span><span>Never on the plan</span></div>
        <DocWallet docs={trip.docs ?? []} onOpen={setDoc} onAdd={(kind) => setDoc({ id: uid('d'), kind, label: DOC_META[kind].label })} />

        <div className="sl"><span>Share &amp; back up</span></div>
        <div className="acts4">
          <button className="pri" onClick={share}><Link2 />Share link</button>
          <button onClick={() => downloadTrip(trip)}><Download />Export</button>
          <button onClick={() => file.current?.click()}><Upload />Import</button>
          <button onClick={() => downloadCalendar(trip)} disabled={!trip.blocks.length}><CalendarPlus />Calendar</button>
        </div>
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
        {msg && <p className="text-sm" style={{ color: '#15803d' }}>{msg}</p>}
        <p className="text-xs t-sub">Whoever opens a link or file gets their own copy. Live sync comes later. Calendar adds every plan to your phone's calendar; add it again after plans change.</p>

        <button
          className="pn trow"
          onClick={() => setSimNow(simNow != null ? null : wallToUtc(trip.timezone, trip.blocks.find((b) => b.locked)?.day ?? trip.startDay, 14 * 60))}
          aria-pressed={simNow != null}
        >
          <span className="x">Preview a time<small>{simNow != null ? `Pretending it's ${dayLabel(now.day)}. Tap to go back to real time` : 'See Now as it’ll look during the trip'}</small></span>
          <span className={simNow != null ? 'tg on' : 'tg'} />
        </button>

        <div className="sl"><span>Start over</span><span>Travel documents stay</span></div>
        <div className="pn np rows">
          <button className="trow" onClick={() => (isSample || confirm(`Clear "${trip.name}" and start a blank trip? Everything on it goes, except travel documents. You can undo right after.`)) && startFresh()}>
            <Eraser />
            <span className="x">{isSample ? 'Clear the sample trip' : 'Start a blank trip'}<small>{isSample ? 'Remove the Helsinki plans and ideas, and start your own' : 'Remove every plan, idea and person but you'}</small></span>
          </button>
          {!isSample && (
            <button className="trow" onClick={() => confirm('Swap this trip for the Helsinki sample? You can undo right after.') && replaceTrip(helsinkiTrip())}>
              <MapPinned />
              <span className="x">Load the sample trip<small>Helsinki, filled in, to see what the app can do</small></span>
            </button>
          )}
        </div>
      </div>

      {editing && <TripSheet onClose={() => setEditing(false)} />}
      {doc && (
        <DocSheet
          doc={doc}
          onClose={() => setDoc(null)}
          onSave={(d) => {
            const docs = trip.docs ?? []
            set({ docs: docs.some((x) => x.id === d.id) ? docs.map((x) => (x.id === d.id ? d : x)) : [...docs, d] })
            setDoc(null)
          }}
          onDelete={() => {
            set({ docs: (trip.docs ?? []).filter((x) => x.id !== doc.id) })
            setDoc(null)
          }}
        />
      )}
    </div>
  )
}

function CostPanel({ trip, onCurrency }: { trip: Trip; onCurrency: (c: string) => void }) {
  const c = useMemo(() => tripCosts(trip), [trip])
  const cur = currencyOf(trip)
  const $ = (n: number) => fmtMoney(n, cur)
  const days = Object.keys(c.byDay).sort()
  return (
    <div className="pn costs">
      <div className="facts">
        <div><span className="k3">Each</span><span className="v3">{$(c.each)}</span></div>
        <div><span className="k3">Group</span><span className="v3">{$(c.total)}</span></div>
        <label>
          <span className="k3">Currency</span>
          <select className="v3" value={cur} onChange={(e) => onCurrency(e.target.value)} aria-label="Currency">
            {[...new Set([cur, ...CURRENCIES])].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
      {days.length > 0 && (
        <ul className="cdays">
          {days.map((d) => <li key={d}><span>{dayLabel(d)}</span><span>{$(c.byDay[d].each)} each</span></li>)}
        </ul>
      )}
      <p className="text-xs t-sub">
        {c.ideas.count > 0
          ? `Plus ${$(c.ideas.each)} each in ${c.ideas.count} idea${c.ideas.count === 1 ? '' : 's'} not on the plan yet.`
          : days.length ? 'Each plan counts once, on its first day.' : 'Add a cost to any card and it adds up here.'}
      </p>
    </div>
  )
}

/** A leather wallet: the passport, insurance and loyalty cards peek out over the list. */
function DocWallet({ docs, onOpen, onAdd }: { docs: TravelDoc[]; onOpen: (d: TravelDoc) => void; onAdd: (k: DocKind) => void }) {
  const first = (k: DocKind) => docs.find((d) => d.kind === k)
  const rows: ReactNode[] = []
  for (const k of ['passport', 'entry', 'insurance', 'loyalty'] as DocKind[]) {
    const list = docs.filter((d) => d.kind === k)
    const M = DOC_META[k]
    if (!list.length) {
      rows.push(<button key={k} onClick={() => onAdd(k)}><M.Icon /><b>{M.label}</b><small className="addd">Add</small></button>)
    }
    for (const d of list) rows.push(<button key={d.id} onClick={() => onOpen(d)}><M.Icon /><b>{d.label}</b><small>{d.value || 'Add details'}</small></button>)
  }
  for (const d of docs.filter((x) => x.kind === 'other')) rows.push(<button key={d.id} onClick={() => onOpen(d)}><Wallet /><b>{d.label}</b><small>{d.value}</small></button>)
  rows.push(<button key="add" onClick={() => onAdd('other')}><Plus /><b className="addd">Something else</b><small /></button>)
  return (
    <div className="wallet">
      <div className="wt"><span><Wallet />Travel documents</span><small>{docs.length ? `${docs.length} kept here` : 'On this device only'}</small></div>
      <div className="docs" aria-hidden="true">
        <div className="pp"><span className="em" /><b>PASSPORT</b></div>
        <div className="dc ins"><span className="k">Insurance</span><b>{first('insurance')?.value || '—'}</b></div>
        <div className="dc loy"><span className="k">Loyalty</span><b>{first('loyalty')?.value || '—'}</b></div>
      </div>
      <div className="wrows">{rows}</div>
    </div>
  )
}

function DocSheet({ doc, onClose, onSave, onDelete }: { doc: TravelDoc; onClose: () => void; onSave: (d: TravelDoc) => void; onDelete: () => void }) {
  const [d, setD] = useState(doc)
  const M = DOC_META[d.kind]
  return (
    <Sheet
      open
      onClose={onClose}
      title={M.label}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost" style={{ color: '#c8102e' }} onClick={onDelete}>Remove</button>
          <button className="btn ml-auto" onClick={() => onSave(d)}>Save</button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Name"><input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} /></Field>
        <Field label="Details" hint={`${M.hint ? `${M.hint}. ` : ''}Saved on this device. Share links leave these out; an exported backup file keeps them.`}>
          <textarea className="input min-h-20" value={d.value ?? ''} onChange={(e) => setD({ ...d, value: e.target.value || undefined })} />
        </Field>
      </div>
    </Sheet>
  )
}

function TripSheet({ onClose }: { onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const mutate = useStore((s) => s.mutate)
  const set = (p: Partial<Trip>) => mutate((t) => ({ ...t, ...p }))
  return (
    <Sheet open onClose={onClose} title="Trip details" footer={<button className="btn w-full" onClick={onClose}>Done</button>}>
      <div className="space-y-3">
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
      </div>
    </Sheet>
  )
}
