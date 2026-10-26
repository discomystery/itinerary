import { type ReactNode, useEffect } from 'react'
import type { Interest, Item, ItemType, Person } from '../types'
import type { Issue, Severity } from '../lib/schedule'

export const TYPE_META: Record<ItemType, { icon: string; label: string; color: string }> = {
  place: { icon: '📍', label: 'Place', color: '#0284c7' },
  event: { icon: '🎟️', label: 'Event', color: '#e11d48' },
  reservation: { icon: '📌', label: 'Reservation', color: '#7c3aed' },
  area: { icon: '🧭', label: 'Area', color: '#0d9488' },
  transport: { icon: '✈️', label: 'Transport', color: '#475569' },
  note: { icon: '📝', label: 'Note', color: '#a16207' },
}

export const INTEREST_META: Record<Interest, { icon: string; label: string }> = {
  must: { icon: '❤️', label: 'Must do' },
  yes: { icon: '👍', label: 'Interested' },
  meh: { icon: '🤷', label: 'Meh' },
  no: { icon: '👎', label: 'Skip' },
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
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          <button className="btn-ghost -mr-2 px-2 text-lg" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function InterestPicker({ value, onChange, size = 'md' }: {
  value?: Interest
  onChange: (v: Interest | null) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex gap-1">
      {INTERESTS.map((k) => (
        <button
          key={k}
          title={INTEREST_META[k].label}
          onClick={(e) => {
            e.stopPropagation()
            onChange(value === k ? null : k)
          }}
          className={cx(
            'rounded-full border transition',
            size === 'sm' ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-base',
            value === k ? 'border-slate-900 bg-slate-100 shadow-inner' : 'border-slate-200 opacity-50 hover:opacity-100',
          )}
        >
          {INTEREST_META[k].icon}
        </button>
      ))}
    </div>
  )
}

/** Compact "who wants this" row: a dot per person with their vote. */
export function InterestDots({ item, people }: { item: Item; people: Person[] }) {
  const voted = people.filter((p) => item.interest[p.id])
  if (!voted.length) return <span className="text-xs text-slate-400">No votes yet</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      {voted.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs"
          style={{ background: p.color + '1a' }}
          title={`${p.name}: ${INTEREST_META[item.interest[p.id]].label}`}
        >
          <Avatar person={p} size={16} />
          {INTEREST_META[item.interest[p.id]].icon}
        </span>
      ))}
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

export const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'bg-rose-100 text-rose-800 border-rose-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
}
const SEVERITY_ICON: Record<Severity, string> = { error: '⛔', warn: '⚠️', info: '🌙' }

export function IssueList({ issues }: { issues?: Issue[] }) {
  if (!issues?.length) return null
  return (
    <ul className="space-y-1">
      {issues.map((i, k) => (
        <li key={k} className={cx('rounded-md border px-2 py-1 text-sm', SEVERITY_STYLE[i.severity])}>
          {i.kind === 'dark' ? '🌙' : SEVERITY_ICON[i.severity]} {i.message}
        </li>
      ))}
    </ul>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1 text-sm transition',
            value === o.value ? 'bg-white font-medium shadow-sm' : 'text-slate-600',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
