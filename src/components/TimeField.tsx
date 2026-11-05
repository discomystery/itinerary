import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useStore } from '../store'
import { cx } from './ui'

// Typing a time, one part at a time. Hours and minutes are their own boxes:
// tap one and type over it (the old value shows faintly until you do), or use
// the arrows that appear above and below it. AM/PM is a switch, not something to
// type. Nothing is saved until a part is whole, so half-typed digits never move
// the plan around.

type Part = 'h' | 'm'

const pad = (n: number) => String(n).padStart(2, '0')

export function TimeField({ value, onChange, label, disabled, className }: {
  /** Minutes from midnight. */
  value: number
  onChange: (min: number) => void
  /** What it's the time of, for screen readers: "Starts", "Doors"… */
  label: string
  disabled?: boolean
  className?: string
}) {
  const h24 = useStore((s) => s.hour24)
  const v = ((Math.round(value) % 1440) + 1440) % 1440
  const hour = Math.floor(v / 60)
  const minute = v % 60
  const pm = hour >= 12
  const shownHour = h24 ? pad(hour) : String(hour % 12 || 12)

  const [part, setPart] = useState<Part | null>(null)
  const [buf, setBuf0] = useState('')
  // Mirrors buf without waiting for a render: moving focus blurs the box straight away,
  // and the blur must see that the part was already saved.
  const bufRef = useRef('')
  const setBuf = (s: string) => {
    bufRef.current = s
    setBuf0(s)
  }
  const hRef = useRef<HTMLInputElement>(null)
  const mRef = useRef<HTMLInputElement>(null)

  /** Hours as typed on this clock (1–12 or 0–23) to a 0–23 hour. */
  const toHour = (typed: number) => (h24 ? typed : (typed % 12) + (pm ? 12 : 0))
  const put = (h: number, m: number) => onChange((((h % 24) + 24) % 24) * 60 + (((m % 60) + 60) % 60))

  /** Commit what's in the box, if it makes a time. */
  const flush = (p: Part, s: string) => {
    if (!s) return
    const n = Number(s)
    if (p === 'h' && (h24 ? n <= 23 : n >= 1 && n <= 12)) put(toHour(n), minute)
    if (p === 'm' && n <= 59) put(hour, n)
  }

  const typed = (p: Part, raw: string) => {
    if (/a/i.test(raw) && pm) put(hour - 12, minute)
    if (/p/i.test(raw) && !pm) put(hour + 12, minute)
    const s = raw.replace(/\D/g, '').slice(-2)
    if (p === 'h') {
      const first = Number(s[0])
      // Done once no second digit could follow: "7" on a 12 hour clock, "17", "3" on a 24 hour one.
      const done = s.length === 2 || (h24 ? first >= 3 : first >= 2)
      if (s.length === 2 && Number(s) > (h24 ? 23 : 12)) {
        // "15" on a 12 hour clock: the 1 was the hour, the 5 starts the minutes.
        flush('h', s[0])
        setBuf('')
        mRef.current?.focus()
        setBuf(s[1])
        return
      }
      if (done && s) {
        flush('h', s)
        setBuf('')
        mRef.current?.focus()
        return
      }
      setBuf(s)
    } else {
      const done = s.length === 2 || Number(s[0]) >= 6
      if (done && s) {
        flush('m', s.length === 1 ? `0${s}` : s)
        setBuf('')
        return
      }
      setBuf(s)
    }
  }

  const step = (p: Part, dir: 1 | -1) => {
    // Hours go round the clock (11 AM up is 12 PM, and the switch flips with it).
    // Minutes go in fives and turn over on their own: :55 up is :00 of the same hour.
    if (p === 'h') put(hour + dir, minute)
    else put(hour, dir > 0 ? Math.floor(minute / 5) * 5 + 5 : Math.ceil(minute / 5) * 5 - 5)
  }

  const key = (p: Part) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      setBuf('')
      step(p, e.key === 'ArrowUp' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setBuf('')
      e.currentTarget.blur()
    } else if (p === 'h' && (e.key === ':' || e.key === '.' || e.key === ' ' || (e.key === 'ArrowRight' && !buf))) {
      e.preventDefault()
      flush('h', bufRef.current)
      setBuf('')
      mRef.current?.focus()
    } else if (p === 'm' && e.key === 'Backspace' && !buf) {
      e.preventDefault()
      hRef.current?.focus()
    } else if (p === 'm' && e.key === 'ArrowLeft' && !buf) {
      e.preventDefault()
      hRef.current?.focus()
    }
  }

  const seg = (p: Part, ref: RefObject<HTMLInputElement | null>, shown: string, name: string) => (
    <span className={cx('tfp', part === p && 'on')}>
      <button type="button" tabIndex={-1} className="tfa up" disabled={disabled} aria-label={`${label}: ${name} up`} onPointerDown={(e) => e.preventDefault()} onClick={() => { setBuf(''); step(p, 1); ref.current?.focus() }}><ChevronUp /></button>
      <input
        ref={ref}
        className="tfs"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint={p === 'h' ? 'next' : 'done'}
        disabled={disabled}
        aria-label={`${label}: ${name}`}
        value={part === p ? buf : shown}
        placeholder={shown}
        onFocus={() => { setPart(p); setBuf('') }}
        onBlur={() => { flush(p, bufRef.current); setBuf(''); setPart((x) => (x === p ? null : x)) }}
        onChange={(e) => typed(p, e.target.value)}
        onKeyDown={key(p)}
      />
      <button type="button" tabIndex={-1} className="tfa dn" disabled={disabled} aria-label={`${label}: ${name} down`} onPointerDown={(e) => e.preventDefault()} onClick={() => { setBuf(''); step(p, -1); ref.current?.focus() }}><ChevronDown /></button>
    </span>
  )

  return (
    <span className={cx('tf', part && 'focus', disabled && 'off', className)} role="group" aria-label={`${label} time`}>
      {seg('h', hRef, shownHour, 'hour')}
      <span className="tfc" aria-hidden="true">:</span>
      {seg('m', mRef, pad(minute), 'minutes')}
      {!h24 && (
        <span className="tfm" role="group" aria-label={`${label}: AM or PM`}>
          <button type="button" disabled={disabled} aria-pressed={!pm} onClick={() => pm && put(hour - 12, minute)}>AM</button>
          <button type="button" disabled={disabled} aria-pressed={pm} onClick={() => !pm && put(hour + 12, minute)}>PM</button>
        </span>
      )}
    </span>
  )
}

/** The 12/24 hour switch, for wherever times are edited. */
export function ClockToggle() {
  const h24 = useStore((s) => s.hour24)
  const set = useStore((s) => s.setHour24)
  return (
    <span className="ctog" role="group" aria-label="Clock">
      <button type="button" aria-pressed={!h24} onClick={() => set(false)}>12h</button>
      <button type="button" aria-pressed={h24} onClick={() => set(true)}>24h</button>
    </span>
  )
}
