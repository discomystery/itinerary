import {
  CircleAlert,
  Compass,
  Heart,
  MapPin,
  Meh,
  Moon,
  type LucideIcon,
  Plane,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  Ticket,
  TriangleAlert,
  Bookmark,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import type { Interest, Item, ItemType, Person } from '../types'
import type { Issue, Severity } from '../lib/schedule'

export const TYPE_META: Record<ItemType, { Icon: LucideIcon; label: string; color: string }> = {
  place: { Icon: MapPin, label: 'Place', color: '#2e4a8a' },
  event: { Icon: Ticket, label: 'Event', color: '#c8102e' },
  reservation: { Icon: Bookmark, label: 'Reservation', color: '#8a6d3b' },
  area: { Icon: Compass, label: 'Area', color: '#0d8f7f' },
  transport: { Icon: Plane, label: 'Transport', color: '#14243b' },
  note: { Icon: StickyNote, label: 'Note', color: '#a16207' },
}

export const INTEREST_META: Record<Interest, { Icon: LucideIcon; label: string; color: string }> = {
  must: { Icon: Heart, label: 'Must do', color: '#c8102e' },
  yes: { Icon: ThumbsUp, label: 'Interested', color: '#1f5fbf' },
  meh: { Icon: Meh, label: 'Meh', color: '#8a8f99' },
  no: { Icon: ThumbsDown, label: 'Pass', color: '#5a6371' },
}
export const INTERESTS: Interest[] = ['must', 'yes', 'meh', 'no']

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[rgb(10_14_20/0.45)]" onClick={onClose} />
      <div className="chrome relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[22px] shadow-2xl sm:rounded-[22px]">
        <div className="mx-auto mt-2 h-[5px] w-[38px] rounded-full bg-[var(--line)] sm:hidden" />
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</div>
          <button className="btn-ghost -mr-2 h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t b-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function InterestPicker({ value, onChange, size = 'md' }: {
  value?: Interest
  onChange: (v: Interest | null) => void
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 28 : 36
  return (
    <div className="flex gap-1">
      {INTERESTS.map((k) => {
        const { Icon, label, color } = INTEREST_META[k]
        const on = value === k
        return (
          <button
            key={k}
            title={label}
            aria-label={label}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              onChange(on ? null : k)
            }}
            className="grid place-items-center rounded-full transition"
            style={{
              width: dim,
              height: dim,
              background: on ? color : 'var(--chrome)',
              color: on ? '#fff' : 'var(--sub)',
              boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--line)',
            }}
          >
            <Icon size={size === 'sm' ? 14 : 17} fill={on && k === 'must' ? 'currentColor' : 'none'} />
          </button>
        )
      })}
    </div>
  )
}

/** Stamped initials for everyone who wants to go. */
export function Votes({ item, people, min = 'yes' }: { item: Item; people: Person[]; min?: 'must' | 'yes' }) {
  const keep = (v?: Interest) => v === 'must' || (min === 'yes' && v === 'yes')
  const voters = people.filter((p) => keep(item.interest[p.id]))
  if (!voters.length) return null
  return (
    <span className="votes">
      {voters.map((p) => (
        <span key={p.id} style={{ background: p.color }} title={`${p.name}: ${INTEREST_META[item.interest[p.id]].label}`}>
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  )
}

/** Everyone's vote, including meh and skip. */
export function VoteList({ item, people }: { item: Item; people: Person[] }) {
  const voted = people.filter((p) => item.interest[p.id])
  if (!voted.length) return <span className="text-xs t-sub">No votes yet</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {voted.map((p) => {
        const { Icon, color } = INTEREST_META[item.interest[p.id]]
        return (
          <span key={p.id} className="chip gap-1 py-0.5 pl-0.5">
            <Avatar person={p} size={18} />
            <Icon size={12} color={color} />
          </span>
        )
      })}
    </span>
  )
}

export function Avatar({ person, size = 24 }: { person: Person; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: person.color, width: size, height: size, fontSize: size * 0.45 }}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

const SEVERITY_ICON: Record<Severity, LucideIcon> = { error: CircleAlert, warn: TriangleAlert, info: Moon }
const SEVERITY_COLOR: Record<Severity, string> = { error: '#c8102e', warn: '#b45309', info: 'var(--sub)' }

export function IssueList({ issues }: { issues?: Issue[] }) {
  if (!issues?.length) return null
  return (
    <ul className="space-y-1">
      {issues.map((i, k) => {
        const Icon = SEVERITY_ICON[i.severity]
        return (
          <li key={k} className="panel flex items-center gap-2 px-2.5 py-1.5 text-sm">
            <Icon size={15} color={SEVERITY_COLOR[i.severity]} className="flex-none" />
            {i.message}
          </li>
        )
      })}
    </ul>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs t-sub">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: 'color-mix(in srgb, var(--sub) 14%, transparent)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-[13px] font-semibold transition"
          style={value === o.value ? { background: 'var(--chrome)', boxShadow: '0 1px 2px rgb(0 0 0 / .15)' } : { color: 'var(--sub)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
