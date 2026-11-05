import { Plus, Route, Users, X } from 'lucide-react'
import { useState } from 'react'
import { spanOf } from '../lib/cards'
import { dayLabel, fmtTime } from '../lib/time'
import { audienceLabel, audienceSource, hasSplits, members, tracksOf, travelFor } from '../lib/tracks'
import { showsMine, useStore } from '../store'
import type { Audience, Block, Id, Item, Trip } from '../types'
import { Avatar, cx } from './ui'

// Tracks in the interface: setting them up on Trip, choosing who a card is
// for, the label a card wears when it isn't for everyone, and the switch
// between your own itinerary and everyone's.

const short = (day: string, min: number) => `${dayLabel(day).split(',')[0]} ${fmtTime(min)}`

/** Everyone, a track, or a few people. Controlled: hand it an audience and get one back. */
export function AudiencePicker({ trip, value, onChange }: { trip: Trip; value?: Audience; onChange: (a: Audience) => void }) {
  const tracks = tracksOf(trip)
  const ids = members(trip, value)
  const everyone = !ids
  const onTrack = value?.track && ids ? value.track : undefined
  // From everyone or a track, a tap on a person starts from who's in now and adds or removes them.
  const toggle = (id: Id) => {
    const cur = ids ?? []
    const next = everyone ? [id] : trip.people.map((p) => p.id).filter((p) => (p === id ? !cur.includes(p) : cur.includes(p)))
    // Nobody, or everybody, both mean the whole group.
    onChange(next.length && next.length < trip.people.length ? { who: next } : {})
  }
  return (
    <div className="going">
      <button type="button" aria-pressed={everyone} onClick={() => onChange({})}><Users /> Everyone</button>
      {tracks.map((t) => (
        <button type="button" key={t.id} aria-pressed={onTrack === t.id} onClick={() => onChange({ track: t.id })} disabled={!t.people.length} title={t.people.length ? undefined : 'Add people to this track first'}>
          <span className="tdot" style={{ background: t.color }} /> {t.name}
        </button>
      ))}
      {trip.people.map((p) => (
        <button type="button" key={p.id} aria-pressed={!everyone && !onTrack && ids!.includes(p.id)} onClick={() => toggle(p.id)} className={cx(!everyone && !ids!.includes(p.id) && 'out')}>
          <Avatar person={p} size={20} /> {p.name}
        </button>
      ))}
    </div>
  )
}

/**
 * Who's on a plan, as a panel under its When. A card planned more than once
 * (two games) sets each time on its own; anything else sets the card, so a
 * stay's check-in, nights and check-out all follow.
 */
export function WhoGoing({ block: b, item }: { block: Block; item: Item }) {
  const trip = useStore((s) => s.trip)
  const setAudience = useStore((s) => s.setAudience)
  const times = trip.blocks.filter((x) => x.itemId === item.id)
  const perTime = times.length > 1 && !spanOf(item, trip.timezone)
  const value = perTime ? audienceSource(item, b) : audienceSource(item)
  const label = audienceLabel(trip, item, perTime ? b : undefined)
  return (
    <div className="pn">
      <div className="sl" style={{ margin: '0 0 8px' }}>
        <span>Who's going</span>
        <span>{label ? `${label.people.length} of ${trip.people.length}` : 'Everyone'}{perTime ? ' · this time' : ''}</span>
      </div>
      <AudiencePicker trip={trip} value={value} onChange={(a) => setAudience(item.id, a, perTime ? b.id : undefined)} />
    </div>
  )
}

/** A small printed tag on a card that isn't for the whole group. */
export function AudienceTag({ trip, item, block }: { trip: Trip; item: Item; block?: Block }) {
  const label = audienceLabel(trip, item, block)
  if (!label) return null
  return (
    <span className="atag" style={label.color ? { ['--tc' as string]: label.color } : undefined} title={`For ${label.people.map((p) => p.name).join(', ')}`}>
      {label.track ? <span className="tdot" /> : label.people.map((p) => <i key={p.id} style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</i>)}
      {label.name}
    </span>
  )
}

/** Mine / Everyone, once some plans are only for part of the group. */
export function ScopeSwitch() {
  const trip = useStore((s) => s.trip)
  const viewer = useStore((s) => s.viewer)
  const organizer = useStore((s) => s.organizer)
  const mine = useStore(showsMine)
  const setEveryone = useStore((s) => s.setEveryone)
  const me = trip.people.find((p) => p.id === viewer)
  if (organizer || !me || !hasSplits(trip)) return null
  return (
    <span className="seg3 scope" role="group" aria-label="Whose plans">
      <button aria-pressed={mine} onClick={() => setEveryone(false)} title={`Just ${me.name}'s itinerary`}><Avatar person={me} size={18} /></button>
      <button aria-pressed={!mine} onClick={() => setEveryone(true)} title="Everyone's plans" aria-label="Everyone"><Users /></button>
    </span>
  )
}

/** Trip → Tracks: name a group, tap who's in it. */
export function TracksPanel() {
  const trip = useStore((s) => s.trip)
  const { addTrack, updateTrack, removeTrack } = useStore()
  const [name, setName] = useState('')
  const tracks = tracksOf(trip)
  const count = (id: Id) => trip.items.filter((i) => i.track === id).length + trip.blocks.filter((b) => b.track === id).length
  return (
    <div className="pn np rows">
      {tracks.map((t) => (
        <div key={t.id} className="track-row">
          <div className="person">
            <label className="relative tswatch" style={{ background: t.color }}>
              <Route />
              <input type="color" className="absolute inset-0 opacity-0" value={t.color} onChange={(e) => updateTrack(t.id, { color: e.target.value })} aria-label={`${t.name} color`} />
            </label>
            <span className="x">
              <input value={t.name} onChange={(e) => updateTrack(t.id, { name: e.target.value })} aria-label="Track name" />
              <small>{t.people.length ? `${t.people.length} ${t.people.length === 1 ? 'person' : 'people'}` : 'Nobody yet'} · {count(t.id)} card{count(t.id) === 1 ? '' : 's'}</small>
            </span>
            <button className="btn-ghost -mr-2 px-1.5" onClick={() => (!count(t.id) || confirm(`Delete ${t.name}? Its ${count(t.id)} card(s) go back to everyone.`)) && removeTrack(t.id)} aria-label={`Delete ${t.name}`}><X size={15} /></button>
          </div>
          <div className="going tpeople">
            {trip.people.map((p) => {
              const on = t.people.includes(p.id)
              return (
                <button key={p.id} aria-pressed={on} className={cx(!on && 'out')} onClick={() => updateTrack(t.id, { people: on ? t.people.filter((x) => x !== p.id) : [...t.people, p.id] })}>
                  <Avatar person={p} size={20} /> {p.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <form
        className="person add"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) addTrack(name.trim())
          setName('')
        }}
      >
        <Plus />
        <input placeholder={tracks.length ? 'Add a track' : 'Add a track, like “Flying in Tuesday”'} value={name} onChange={(e) => setName(e.target.value)} aria-label="Add a track" />
        {name && <button className="sw">Add</button>}
      </form>
    </div>
  )
}

/** "Lands Wed 3:20p · leaves Mon 11:05a", from the flights someone is on. */
export function travelLine(trip: Trip, person: Id): string | null {
  const t = travelFor(trip, person)
  const bits = [t.arrive && `Lands ${short(t.arrive.day, t.arrive.min)}`, t.leave && `leaves ${short(t.leave.day, t.leave.min)}`].filter(Boolean)
  return bits.length ? bits.join(' · ') : null
}
