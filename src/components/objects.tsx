import {
  Bath,
  Building2,
  CalendarCheck,
  CirclePlus,
  Compass,
  Landmark,
  type LucideIcon,
  MapPin,
  Plane,
  Ship,
  ShoppingBag,
  StickyNote,
  Sun,
  Ticket,
  TrainFront,
  TramFront,
  Trees,
  TriangleAlert,
  UtensilsCrossed,
  Wine,
  KeyRound,
  CircleAlert,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { hoursSummary, openSpans } from '../lib/hours'
import { anchorOnDay, type Issue, worstSeverity } from '../lib/schedule'
import { dayLabel, fmtDuration } from '../lib/time'
import type { Block, Item, Person } from '../types'
import { cx, Votes } from './ui'

// Every plan is drawn as the real-world object it stands for. They all share
// one skeleton — [body | signature] — so they stack and tile cleanly; only the
// paper, the glyph and what sits in the signature column change.

export type ObjectKind = 'ticket' | 'pass' | 'fare' | 'resv' | 'key' | 'post' | 'map' | 'note'

const has = (i: Item, ...tags: string[]) => tags.some((t) => i.tags.includes(t))

export function objectKind(i: Item): ObjectKind {
  switch (i.type) {
    case 'event':
      return 'ticket'
    case 'transport':
      return has(i, 'flight') || /\bflight\b/i.test(i.title) ? 'pass' : 'fare'
    case 'reservation':
      return has(i, 'lodging', 'hotel') ? 'key' : 'resv'
    case 'area':
      return 'map'
    case 'note':
      return 'note'
    default:
      return 'post'
  }
}

/** The small icon that names what this is. */
export function glyphFor(i: Item): LucideIcon {
  const k = objectKind(i)
  if (k === 'ticket') return Ticket
  if (k === 'pass') return Plane
  if (k === 'fare') return has(i, 'ferry') || /ferry/i.test(i.title) ? Ship : /train/i.test(i.title) || has(i, 'train') ? TrainFront : TramFront
  if (k === 'key') return KeyRound
  if (k === 'map') return Compass
  if (k === 'note') return StickyNote
  if (has(i, 'food')) return UtensilsCrossed
  if (has(i, 'sauna')) return Bath
  if (k === 'resv') return CalendarCheck
  if (has(i, 'museum', 'sights')) return Landmark
  if (has(i, 'outdoors')) return Trees
  if (has(i, 'architecture')) return Building2
  if (has(i, 'shopping')) return ShoppingBag
  if (has(i, 'nightlife')) return Wine
  return MapPin
}

const KIND_WORD: Record<ObjectKind, string> = {
  ticket: 'Event', pass: 'Flight', fare: 'Transit', resv: 'Reservation', key: 'Stay', post: 'Place', map: 'Area', note: 'To-do',
}

/** A short clock time that always shows minutes: 7:00p, 12:30a. */
export function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`
}

function placeWord(i: Item): string {
  if (has(i, 'food')) return 'Food'
  if (has(i, 'museum')) return 'Museum'
  if (has(i, 'sauna')) return 'Sauna'
  if (has(i, 'sights')) return 'Sight'
  if (has(i, 'architecture')) return 'Architecture'
  if (has(i, 'shopping')) return 'Shopping'
  if (has(i, 'nightlife')) return 'Nightlife'
  if (has(i, 'outdoors')) return 'Outdoors'
  return 'Place'
}

export function defaultEyebrow(i: Item, day?: string, block?: Block, tz?: string): string {
  const k = objectKind(i)
  if (k === 'post') {
    const word = placeWord(i)
    if (day && i.hours) {
      const spans = openSpans(i.hours, day)
      if (spans && spans.length === 0) return `${word} · closed today`
      const last = spans?.at(-1)
      if (last && last[1] < 1440 + 6 * 60) return `${word} · open till ${clock(last[1]).replace(':00', '')}`
    }
    return `${word} · ~${fmtDuration(i.duration.typical)}`
  }
  if (k === 'ticket') {
    const soft = block && tz ? i.anchors.find((a) => !a.hard) : undefined
    if (soft && block && tz) return `${soft.label.replace(' (est.)', '')} ~${clock(anchorOnDay(soft, block.day, tz))}`
    const a = i.anchors[0]
    return a ? `Event · ${dayLabel(a.day).split(',')[0]} ${a.day.slice(8)}` : 'Event'
  }
  if (k === 'map') return `Area · ~${fmtDuration(i.duration.typical)}`
  if (k === 'resv') return i.tbd ? 'Not booked yet' : 'Reserved'
  if (k === 'note') return 'To-do'
  if (k === 'fare') return `Transit · ~${fmtDuration(i.duration.typical)}`
  return KIND_WORD[k]
}

export interface ObjectProps {
  item: Item
  size?: 'm' | 'l' | 't'
  block?: Block
  day?: string
  tz?: string
  people?: Person[]
  issues?: Issue[]
  eyebrow?: ReactNode
  detail?: ReactNode
  /** Replace the signature column entirely. */
  sig?: ReactNode
  /** Extra content under the title (detail size). */
  children?: ReactNode
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

function Signature({ item, block, tz }: { item: Item; block?: Block; tz?: string }) {
  const k = objectKind(item)
  const Glyph = glyphFor(item)
  const hard = item.anchors.find((a) => a.hard)
  const hardAt = hard && tz ? anchorOnDay(hard, block?.day ?? hard.day, tz) : undefined
  const at = block ? clock(block.start) : undefined
  if (k === 'ticket' || k === 'pass') {
    const label = k === 'pass' ? 'Departs' : hard ? hard.label.split(' ')[0] : 'Starts'
    const t = hardAt != null ? clock(hardAt) : at
    return (
      <>
        <span className="sk">{label}</span>
        <span className={cx('sv', k === 'ticket' && hard && 'hard', !t && 'dash')}>{t ?? '--:--'}</span>
      </>
    )
  }
  if (k === 'resv') {
    if (item.tbd) return (<><CirclePlus size={18} /><span className="sk">Book</span></>)
    return (<><span className="sk">Reserved</span><span className="sv">{at ?? '—'}</span></>)
  }
  if (k === 'key') return (<><span className="chipcard" /><span className="sk">{at ? `In ${at}` : 'Stay'}</span></>)
  if (k === 'note') return <span className="checkbox" />
  const mark =
    k === 'post' ? (
      <span className="stamp"><i><Glyph /></i></span>
    ) : k === 'map' ? (
      <span className="ring" />
    ) : (
      <Glyph size={18} />
    )
  return (
    <>
      {mark}
      {at && <span className="tm">{at}</span>}
    </>
  )
}

export function ObjectCard({ item, size = 'm', block, day, tz, people, issues, eyebrow, detail, sig, children, onClick, className, style }: ObjectProps) {
  const k = objectKind(item)
  const Glyph = glyphFor(item)
  const perf = k === 'ticket' || k === 'pass' || k === 'fare'
  const sev = worstSeverity(issues?.filter((i) => i.severity !== 'info'))
  const closed = issues?.some((i) => i.kind === 'closed')
  const dark = issues?.find((i) => i.kind === 'dark')
  const Tag = onClick ? 'button' : 'div'
  const theDay = day ?? block?.day
  const hours = theDay ? hoursSummary(item.hours, theDay, clock) : null
  const eb = eyebrow ?? defaultEyebrow(item, theDay, block, tz)
  const dt =
    detail ??
    (size !== 't' && (item.tbd ? <span className="warnline flex items-center gap-1"><CircleAlert />{item.tbd}</span> : item.address ?? (hours ? `Hours ${hours}` : null)))
  return (
    <Tag
      className={cx('o', size, k, perf && 'perf', k === 'resv' && item.tbd && 'open', className)}
      onClick={onClick}
      style={style}
      type={onClick ? 'button' : undefined}
    >
      <div className="b">
        <div className="eb">
          {sev ? <TriangleAlert style={{ color: sev === 'error' ? '#c8102e' : '#b45309' }} /> : <Glyph />}
          <span>{eb}</span>
        </div>
        <div className="tt">{item.title}</div>
        {dark && item.prefersDaylight && <div className="mt warnline"><Sun />{dark.message}</div>}
        {!dark && dt && <div className="mt">{dt}</div>}
        {children}
        {size === 't' && people && <div className="mt-auto pt-1"><Votes item={item} people={people} /></div>}
      </div>
      <div className="s">
        {sig ?? <Signature item={item} block={block} tz={tz} />}
        {closed && <span className="closed-stamp">CLOSED</span>}
      </div>
    </Tag>
  )
}
