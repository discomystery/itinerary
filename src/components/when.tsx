import { Lock, LockOpen, Minus, Plus, X } from 'lucide-react'
import { KINDS, cardKind } from '../lib/cards'
import { isFlight } from '../lib/flights'
import { dayLabel, fmtDuration, parseHHMM, toHHMM } from '../lib/time'
import { canSpan, isMultiDay, labelsFor, lengthOf, moveEnd, moveStart, norm, settle, type When } from '../lib/when'
import { uid } from '../store'
import type { Item } from '../types'
import { clock } from './objects'
import { cx } from './ui'

// The one place you say when something happens. The same control sits in the card
// editor, the plan sheet on phones and the details pane on bigger screens.

const short = (d: string) => {
  const [wd, md] = dayLabel(d).split(', ')
  return `${wd} ${md.split(' ')[1]}`
}

export function WhenFields({ item, w, tz, days, scheduled, onChange, addToPlan, onAddToPlan }: {
  item: Item
  w: When
  tz: string
  /** The trip's days, for the day pickers. */
  days: string[]
  /** It already has a slot on the plan. */
  scheduled: boolean
  onChange: (w: When) => void
  /** Offer to put it on the plan (the editor, for a card that isn't on a day yet). */
  addToPlan?: boolean
  onAddToPlan?: (on: boolean) => void
}) {
  const flight = isFlight(item)
  const multi = w.set && isMultiDay(item, w)
  const rows = w.set || scheduled
  const len = lengthOf(w)
  const summary = !rows ? `about ${fmtDuration(w.takes)}` : w.allDay || multi ? dayCount(w) : fmtDuration(len)
  const lb = labelsFor(item)
  const caps = w.set ? [w.main?.label ?? lb.start, multi ? w.last?.label ?? lb.end : 'Ends'] : ['Starts', 'Ends']
  const shift = (m: number) => onChange(moveStart(w, norm(w.day, w.start + m).day, norm(w.day, w.start + m).min))

  return (
    <div className="pn whenpn">
      <div className="sl" style={{ margin: '0 0 8px' }}><span>When</span><span>{summary}</span></div>

      {!flight && (
        <>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Kind of time">
            <button aria-pressed={!w.set} onClick={() => onChange({ ...w, set: false, allDay: false })}>Flexible</button>
            <button aria-pressed={w.set} onClick={() => onChange({ ...w, set: true })}>Set time</button>
          </div>
        </>
      )}

      {!rows ? (
        <div className="takes">
          <small>Takes about</small>
          <span className="stp2">
            <button onClick={() => onChange({ ...w, takes: Math.max(15, w.takes - 15) })} aria-label="15 minutes less"><Minus /></button>
            <b>{fmtDuration(w.takes)}</b>
            <button onClick={() => onChange({ ...w, takes: w.takes + 15 })} aria-label="15 minutes more"><Plus /></button>
          </span>
          {[30, 60, 120, 180].map((m) => (
            <button key={m} className="chipb" aria-pressed={w.takes === m} onClick={() => onChange({ ...w, takes: m })}>{fmtDuration(m)}</button>
          ))}
        </div>
      ) : (
        <>
          <div className="wrows">
            <Row
              cap={caps[0]} days={days} day={w.day} time={w.allDay ? null : w.start} disabled={flight}
              onDay={(d) => onChange(moveStart(w, d, w.start))}
              onTime={(t) => onChange(moveStart(w, w.day, t))}
            />
            <Row
              cap={caps[1]} days={days.filter((d) => d >= w.day)} day={w.endDay} time={w.allDay ? null : w.end} disabled={flight}
              onDay={(d) => onChange(moveEnd(w, d, w.end))}
              onTime={(t) => onChange(moveEnd(w, w.endDay, t))}
            />
          </div>

          {!w.allDay && !flight && (
            <div className="nudge">
              <span className="stp2"><button onClick={() => shift(-15)}>−15</button><button onClick={() => shift(15)}>+15</button></span>
              <span className="stp2"><button onClick={() => shift(-60)}>−1h</button><button onClick={() => shift(60)}>+1h</button></span>
            </div>
          )}
          {!flight && (
            <div className="nudge">
              {w.set && canSpan(item) && (
                <label className="chipb">
                  <input type="checkbox" checked={w.allDay} onChange={(e) => onChange(e.target.checked ? { ...w, allDay: true } : untimed(w))} /> All day
                </label>
              )}
              {!w.allDay && (
                <button
                  className="fixb"
                  aria-pressed={w.fixed}
                  onClick={() => onChange({ ...w, fixed: !w.fixed })}
                  title={w.fixed ? 'Fixed: running late never moves it. Tap to let it move' : 'Can move when you run late. Tap to fix this time'}
                >
                  {w.fixed ? <><Lock /> Fixed time</> : <><LockOpen /> Can move</>}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {w.set && !w.allDay && !flight && <Moments item={item} w={w} days={days} onChange={(x) => onChange(settle(x, tz))} />}

      {onAddToPlan && !scheduled && w.set && !w.allDay && !multi && (
        <label className="addplan">
          <input type="checkbox" checked={!!addToPlan} onChange={(e) => onAddToPlan(e.target.checked)} />
          Put it on the plan for {short(w.day)}
        </label>
      )}
    </div>
  )
}

/** Back from all day: give it ordinary hours rather than midnight to midnight. */
const untimed = (w: When): When => (w.start || w.end ? { ...w, allDay: false } : { ...w, allDay: false, start: 10 * 60, end: w.endDay > w.day ? 18 * 60 : 11 * 60 })

const dayCount = (w: When) => {
  const n = Math.round((Date.parse(w.endDay) - Date.parse(w.day)) / 86400000) + 1
  return `${n} day${n > 1 ? 's' : ''}`
}

function Row({ cap, days, day, time, disabled, onDay, onTime }: {
  cap: string
  days: string[]
  day: string
  time: number | null
  disabled?: boolean
  onDay: (d: string) => void
  onTime: (t: number) => void
}) {
  return (
    <div className={cx('wrow', time == null && 'noday')}>
      <small>{cap}</small>
      <label className="wf">
        <b>{short(day)}</b>
        <select value={day} disabled={disabled} onChange={(e) => onDay(e.target.value)} aria-label={`${cap} day`}>
          {[...new Set([...days, day])].sort().map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
        </select>
      </label>
      {time != null && (
        <label className="wf">
          <b>{clock(time)}</b>
          <input type="time" value={toHHMM(time)} disabled={disabled} aria-label={`${cap} time`} onChange={(e) => {
            const t = parseHHMM(e.target.value)
            if (t != null) onTime(t)
          }} />
        </label>
      )}
    </div>
  )
}

/** Extra times printed on the card: Doors, Boarding, Last entry… */
function Moments({ item, w, days, onChange }: { item: Item; w: When; days: string[]; onChange: (w: When) => void }) {
  const presets = KINDS[cardKind(item)].times ?? []
  const used = (p: string) => w.moments.some((a) => a.label.startsWith(p))
  const next = presets.find((p) => p !== w.main?.label && !used(p))
  const upd = (id: string, p: Partial<When['moments'][number]>) => onChange({ ...w, moments: w.moments.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const multi = w.endDay > w.day
  return (
    <div className="moments">
      <div className="sl"><span>Also on the card</span></div>
      {w.moments.map((a) => (
        <div key={a.id} className="mom">
          <input className="input py-1" value={a.label} onChange={(e) => upd(a.id, { label: e.target.value })} aria-label="What happens" />
          {multi && (
            <select className="input w-auto py-1" value={a.day} onChange={(e) => upd(a.id, { day: e.target.value })} aria-label="Day">
              {[...new Set([...days, a.day])].sort().map((d) => <option key={d} value={d}>{short(d)}</option>)}
            </select>
          )}
          <input type="time" className="input w-auto py-1" value={toHHMM(a.time)} onChange={(e) => {
            const t = parseHHMM(e.target.value)
            if (t != null) upd(a.id, { time: t })
          }} aria-label={`${a.label} time`} />
          <button className="lockb" aria-pressed={a.hard} onClick={() => upd(a.id, { hard: !a.hard })} title={a.hard ? "Can't miss it: flagged if the plan runs late" : 'Nice to know'} aria-label={a.hard ? `${a.label}: can't miss. Make it soft` : `${a.label}: soft. Make it a must`}>
            {a.hard ? <Lock /> : <LockOpen />}
          </button>
          <button className="btn-ghost px-1.5" onClick={() => onChange({ ...w, moments: w.moments.filter((x) => x.id !== a.id) })} aria-label={`Remove ${a.label}`}><X size={15} /></button>
        </div>
      ))}
      <button
        className="btn-soft mt-1.5 py-1 text-xs"
        onClick={() => {
          // Doors and boarding come before the start; anything else after it.
          const label = next ?? 'Doors'
          const at = norm(w.day, w.start + (/door|board|check|meet/i.test(label) ? -30 : 30))
          onChange({ ...w, moments: [...w.moments, { id: uid('a'), label, day: at.day, time: at.min, hard: false }] })
        }}
      >
        <Plus size={13} /> Add {next ? `“${next}”` : 'a time'}
      </button>
    </div>
  )
}
