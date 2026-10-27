import {
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  Building2,
  Bus,
  CalendarCheck,
  CarFront,
  CarTaxiFront,
  Check,
  CircleAlert,
  CirclePlus,
  Compass,
  Flag,
  House,
  KeyRound,
  Landmark,
  type LucideIcon,
  MapPin,
  Plane,
  PlaneLanding,
  Plus,
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
} from 'lucide-react'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { cardKind, coveredByPass, det, spanOf, variantOf } from '../lib/cards'
import { isFlight, layovers, via } from '../lib/flights'
import { hoursSummary, openSpans } from '../lib/hours'
import { anchorInTrip, anchorOnDay, type Issue, worstSeverity } from '../lib/schedule'
import { dayLabel, dayRange, fmtDuration } from '../lib/time'
import { distanceMeters } from '../lib/transit'
import { uid, useStore } from '../store'
import type { Block, CardKind, FlightLeg, Item, Person, Trip } from '../types'
import { cx, Votes } from './ui'

// Every plan is drawn as the real-world object it stands for. Folded, they all
// share one skeleton, [body | signature], so they stack and tile cleanly.
// Unfolded, the card grows a second row: [details | stub].

export type ObjectKind = CardKind
export const objectKind = cardKind

const has = (i: Item, ...tags: string[]) => tags.some((t) => i.tags.includes(t))

/** The small icon that names what this is. */
export function glyphFor(i: Item): LucideIcon {
  const k = cardKind(i)
  const v = variantOf(i)
  switch (k) {
    case 'ticket':
      return Ticket
    case 'voucher':
      return Flag
    case 'pass':
      return v === 'train' ? TrainFront : v === 'ferry' ? Ship : v === 'coach' ? Bus : Plane
    case 'fare':
      return has(i, 'ferry') || /ferry/i.test(i.title) ? Ship : /train/i.test(i.title) || has(i, 'train') ? TrainFront : TramFront
    case 'xfer':
      return CarTaxiFront
    case 'key':
      return KeyRound
    case 'tag':
      return v === 'hostel' ? BedDouble : House
    case 'car':
      return CarFront
    case 'cpass':
      return BadgeCheck
    case 'map':
      return Compass
    case 'note':
      return StickyNote
  }
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

/** A short clock time that always shows minutes: 7:00p, 12:30a. */
export function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`
}

/** A clock time with the a/p printed small, the way timetables do. */
export function Clock({ m }: { m: number }) {
  const s = clock(m)
  return (
    <>
      {s.slice(0, -1)}
      <small className="ap">{s.slice(-1)}</small>
    </>
  )
}

/** "10–8": an opening span the way a postmark would print it. */
const shortHour = (m: number) => {
  const s = clock(m)
  return s.endsWith(':00a') || s.endsWith(':00p') ? s.slice(0, -4) : s.slice(0, -1)
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

const dayShort = (day: string) => {
  const [w, md] = dayLabel(day).split(', ')
  return `${w} ${md.split(' ')[1]} ${md.split(' ')[0]}`
}

const PASS_WORD: Record<string, string> = { flight: 'Flight', train: 'Train', ferry: 'Ferry', coach: 'Coach' }

/** Is this block the last day of something that spans days (check out, return)? */
function endOfSpan(i: Item, tz: string, day?: string) {
  const s = spanOf(i, tz)
  return s && day === s.to.day ? s : null
}

export function defaultEyebrow(i: Item, day?: string, block?: Block, tz?: string): string {
  const k = cardKind(i)
  const v = variantOf(i)
  const firstDay = i.anchors.length && tz ? anchorInTrip(i.anchors[0], tz).day : undefined
  const on = (d?: string) => (d ? ` · ${dayShort(d).split(' ').slice(0, 2).join(' ')} ${dayShort(d).split(' ')[2]}` : '')
  const end = tz ? endOfSpan(i, tz, day) : null
  switch (k) {
    case 'post': {
      const word = placeWord(i)
      if (day && i.hours) {
        const spans = openSpans(i.hours, day)
        if (spans && spans.length === 0) return `${word} · closed today`
        const last = spans?.at(-1)
        if (last && last[1] < 1440 + 6 * 60) return `${word} · open till ${clock(last[1]).replace(':00', '')}`
      }
      return `${word} · ~${fmtDuration(i.duration.typical)}`
    }
    case 'ticket': {
      if (v === 'timed') return `Timed entry${on(day ?? firstDay)}`
      const soft = block && tz ? i.anchors.find((a) => !a.hard) : undefined
      if (soft && block && tz) return `${soft.label.replace(' (est.)', '')} ~${clock(anchorOnDay(soft, block.day, tz))}`
      return `Event${on(firstDay)}`
    }
    case 'map':
      return `Area · ~${fmtDuration(i.duration.typical)}`
    case 'resv':
      return i.tbd ? 'Not booked yet' : `Reserved${on(day)}`
    case 'note':
      return 'To-do'
    case 'fare':
      return v === 'day' ? `Day pass${det(i, 'zones') ? ` · zones ${det(i, 'zones')}` : ''}` : `Transit · ~${fmtDuration(i.duration.typical)}`
    case 'pass':
      if (isFlight(i)) {
        const stops = via(i.legs)
        return `${stops.length ? `Flight · via ${stops.join(', ')}` : 'Flight · nonstop'}${on(day ?? firstDay)}${block && block.end >= 1440 ? ' · lands +1' : ''}`
      }
      return `${PASS_WORD[v ?? 'flight']}${on(day ?? firstDay)}`
    case 'xfer':
      return `Transfer${on(day ?? firstDay)}`
    case 'voucher':
      return `Tour${on(day ?? firstDay)}`
    case 'cpass':
      return `City pass${det(i, 'length') ? ` · ${det(i, 'length')}` : ''}`
    case 'car': {
      if (end) return 'Rental car · return'
      const s = tz ? spanOf(i, tz) : null
      return s ? `Rental car · ${dayRange(s.from.day, s.to.day).length} days` : 'Rental car'
    }
    case 'key':
    case 'tag': {
      const word = k === 'key' ? 'Hotel' : v === 'hostel' ? 'Hostel' : 'Rental'
      if (end) return `Check out · ${word.toLowerCase()}`
      const s = tz ? spanOf(i, tz) : null
      if (block && s && block.day === s.from.day) return `Check in · ${word.toLowerCase()}`
      return s ? `Stay · ${word.toLowerCase()} · ${dayRange(s.from.day, s.to.day).length - 1} nights` : `Stay · ${word.toLowerCase()}`
    }
  }
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
  /** Unfold: show the card's second row with all its details. */
  open?: boolean
  /** Actions printed along the bottom of the unfolded card. */
  strip?: ReactNode
  /** Tapping "add" links inside the unfolded card (seats, flight details…). */
  onEdit?: () => void
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

/** When this block runs, or the item's own first time when it isn't scheduled. */
function whenOf(item: Item, block: Block | undefined, tz: string | undefined, label?: string) {
  const a = (label ? item.anchors.find((x) => x.label.startsWith(label)) : undefined) ?? item.anchors.find((x) => x.hard) ?? item.anchors[0]
  if (a && tz) return { t: anchorOnDay(a, block?.day ?? anchorInTrip(a, tz).day, tz), hard: a.hard, label: a.label }
  if (block) return { t: block.start, hard: false, label: undefined }
  return null
}

function TimeSig({ k, t, hard }: { k: string; t?: number; hard?: boolean }) {
  return (
    <>
      <span className="sk">{k}</span>
      <span className={cx('sv', hard && 'hard', t == null && 'dash')}>{t != null ? <Clock m={t} /> : '--:--'}</span>
    </>
  )
}

function Signature({ item, block, tz, day, covered }: { item: Item; block?: Block; tz?: string; day?: string; covered: boolean }) {
  const k = cardKind(item)
  const v = variantOf(item)
  const Glyph = glyphFor(item)
  const at = block ? block.start : undefined
  const end = tz ? endOfSpan(item, tz, day ?? block?.day) : null
  if (end) return <TimeSig k={k === 'car' ? 'Return' : 'Out by'} t={end.to.min} hard={end.to.anchor.hard} />
  switch (k) {
    case 'ticket': {
      const w = whenOf(item, block, tz, v === 'timed' ? 'Entry' : undefined)
      return <TimeSig k={v === 'timed' ? 'Entry' : w?.label?.split(' ')[0] ?? 'Starts'} t={w?.t} hard={w?.hard} />
    }
    case 'pass': {
      const w = whenOf(item, block, tz, 'Depart')
      return <TimeSig k={v === 'ferry' ? 'Sails' : 'Departs'} t={w?.t} hard={w?.hard ?? true} />
    }
    case 'voucher': {
      const w = whenOf(item, block, tz, 'Meet')
      return <TimeSig k="Meet" t={w?.t} hard={w?.hard} />
    }
    case 'xfer': {
      const w = whenOf(item, block, tz)
      return <TimeSig k="Pickup" t={w?.t} />
    }
    case 'car': {
      const s = tz ? spanOf(item, tz) : null
      return <TimeSig k="Pick up" t={s ? s.from.min : whenOf(item, block, tz)?.t} />
    }
    case 'resv':
      if (item.tbd) return (<><CirclePlus size={18} /><span className="sk">Book</span></>)
      return <TimeSig k="Reserved" t={at} />
    case 'key':
      return (<><span className="chipcard" /><span className="sk">{at != null ? <>In <Clock m={at} /></> : 'Stay'}</span></>)
    case 'tag': {
      if (v === 'hostel' && det(item, 'bed')) return (<><span className="sk">Bed</span><span className="tm">{det(item, 'bed')}</span></>)
      const s = tz ? spanOf(item, tz) : null
      const t = s ? s.from.min : item.anchors[0] ? item.anchors[0].time : undefined
      return (<><span className="sk">Check in</span>{t != null ? <span className="tm"><Clock m={t} /></span> : <span className="tm dash">--:--</span>}</>)
    }
    case 'cpass': {
      const s = tz ? spanOf(item, tz) : null
      const d = day ?? block?.day
      const n = s && d ? dayRange(s.from.day, s.to.day).indexOf(d) : -1
      return (<><span className="sv">{det(item, 'length') ?? 'Pass'}</span>{s && n >= 0 && <span className="sk">Day {n + 1}/{dayRange(s.from.day, s.to.day).length}</span>}</>)
    }
    case 'fare': {
      const z = det(item, 'zones')
      if (v === 'day' || z) return (<>{z ? <Zones z={z} /> : <Glyph size={18} />}{at != null ? <span className="tm"><Clock m={at} /></span> : v === 'day' && <span className="sk">Day pass</span>}</>)
      break
    }
    case 'note':
      return <span className="checkbox" />
  }
  const mark = k === 'post' ? (covered ? <span className="passmk">PASS</span> : <span className="stamp"><i><Glyph /></i></span>) : k === 'map' ? <span className="ring" /> : <Glyph size={18} />
  return (
    <>
      {mark}
      {at != null && <span className="tm"><Clock m={at} /></span>}
    </>
  )
}

const Zones = ({ z, big }: { z: string; big?: boolean }) => (
  <span className={cx('zones', big && 'big')}>{z.replace(/[^A-Za-z]/g, '').toUpperCase().split('').slice(0, 4).map((c) => <i key={c}>{c}</i>)}</span>
)

export function ObjectCard({ item, size = 'm', block, day, tz, people, issues, eyebrow, detail, sig, children, open, strip, onEdit, onClick, className, style }: ObjectProps) {
  const trip = useStore((s) => s.trip)
  const k = cardKind(item)
  const v = variantOf(item)
  const Glyph = glyphFor(item)
  const perf = k === 'ticket' || k === 'pass' || k === 'fare'
  const sev = worstSeverity(issues?.filter((i) => i.severity !== 'info'))
  const closed = issues?.some((i) => i.kind === 'closed')
  const dark = issues?.find((i) => i.kind === 'dark')
  const Tag = onClick ? 'button' : 'div'
  const theDay = day ?? block?.day
  const hours = theDay ? hoursSummary(item.hours, theDay, clock) : null
  const eb = eyebrow ?? defaultEyebrow(item, theDay, block, tz)
  const covered = k === 'post' && coveredByPass(trip).has(item.id)
  const dt =
    detail ??
    (size !== 't' &&
      (item.tbd ? <span className="warnline flex items-center gap-1"><CircleAlert />{item.tbd}</span> : metaLine(item, k, v) ?? item.address ?? (hours ? `Hours ${hours}` : null)))
  const head = (
    <>
      <div className="b">
        <div className="eb">
          {sev ? <TriangleAlert style={{ color: sev === 'error' ? '#c8102e' : '#b45309' }} /> : <Glyph />}
          <span>{eb}</span>
        </div>
        <div className="tt">{item.title}</div>
        {dark && item.prefersDaylight && <div className="mt warnline"><Sun />{dark.message}</div>}
        {!dark && dt && <div className="mt">{dt}</div>}
        {children}
        {size === 't' && people && <div className="mt-auto pt-1"><Votes item={item} people={people} block={block} /></div>}
      </div>
      <div className="s">
        {sig ?? <Signature item={item} block={block} tz={tz} day={theDay} covered={covered} />}
        {closed && <span className="closed-stamp">CLOSED</span>}
      </div>
    </>
  )
  const cls = cx('o', size, k, v && `v-${v}`, perf && 'perf', k === 'resv' && item.tbd && 'open-resv', open && 'unf', className)
  if (!open) {
    return (
      <Tag className={cls} onClick={onClick} style={style} type={onClick ? 'button' : undefined}>
        {head}
      </Tag>
    )
  }
  // Unfolded: the header row stays tappable (to fold back); the details are a
  // separate row so their own buttons don't fight the card's tap.
  return (
    <div className={cls} style={style}>
      {onClick ? (
        <button type="button" className="fold" onClick={onClick} aria-label={`Fold ${item.title}`} aria-expanded>
          {head}
        </button>
      ) : (
        <div className="fold">{head}</div>
      )}
      <Unfolded item={item} trip={trip} block={block} day={theDay} strip={strip} onEdit={onEdit} />
    </div>
  )
}

/** The one-line meta under the title, when a kind has something better than the address. */
function metaLine(i: Item, k: CardKind, v?: string): string | null {
  if (k === 'pass') {
    const bits = v === 'train' ? [det(i, 'train'), det(i, 'coach') && `coach ${det(i, 'coach')}`, det(i, 'seat') && `seat ${det(i, 'seat')}`]
      : v === 'ferry' ? [det(i, 'terminal'), i.address]
      : v === 'coach' ? [det(i, 'bay') && `bay ${det(i, 'bay')}`, det(i, 'seat') && `seat ${det(i, 'seat')}`]
      : isFlight(i) ? i.legs.map((l) => l.flightNo)
      : [det(i, 'airline'), det(i, 'flight'), det(i, 'seat') && `seat ${det(i, 'seat')}`]
    const s = bits.filter(Boolean).join(' · ')
    return s || null
  }
  if (k === 'voucher' && det(i, 'meet')) return `Meet: ${det(i, 'meet')}`
  if (k === 'cpass') return det(i, 'covers') ? `Covers ${det(i, 'covers')!.split(',').filter(Boolean).length} of your plans` : null
  if (k === 'car' && det(i, 'returnAt')) return `Return: ${det(i, 'returnAt')}`
  if (k === 'tag' && variantOf(i) === 'hostel' && det(i, 'dorm')) return `Dorm ${det(i, 'dorm')}`
  return null
}

/* ------------------------------ Unfolded ------------------------------- */

const KV = ({ k, v, wide }: { k: string; v?: ReactNode; wide?: boolean }) => (
  <div className={cx(v == null && 'dash', wide && 'col-span-2')}>
    <div className="k">{k}</div>
    <div className="v">{v ?? '—'}</div>
  </div>
)

/** Each flight of a connection, with the layover printed between them. */
function LegList({ legs, tz }: { legs: FlightLeg[]; tz: string }) {
  const lays = layovers(legs, tz)
  return (
    <div className="legs">
      {legs.map((l, n) => (
        <Fragment key={l.id}>
          <div className="leg">
            <span className="fn">{l.flightNo ?? '—'}</span>
            <span>{l.from.toUpperCase()}–{l.to.toUpperCase()}</span>
            <span><Clock m={l.depart.time} />–<Clock m={l.arrive.time} />{l.arrive.day > l.depart.day && <sup>+1</sup>}</span>
            <span className="st">{l.seat ? `Seat ${l.seat}` : ''}</span>
          </div>
          {lays[n] && (
            <div className={cx('lay', (lays[n].tight || lays[n].leaveFrom) && 'warnline')}>
              {lays[n].minutes < 0 ? `Leaves ${lays[n].leaveFrom ?? lays[n].at} before you land` : `${fmtDuration(lays[n].minutes)} in ${lays[n].at}${lays[n].leaveFrom ? `, leave from ${lays[n].leaveFrom}` : ''}${lays[n].overnight ? ' · overnight' : ''}`}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

function Add({ label, onEdit }: { label: string; onEdit?: () => void }) {
  if (!onEdit) return null
  return (
    <button type="button" className="add" onClick={onEdit}>
      <Plus /> {label}
    </button>
  )
}

/** A stand-in QR code, drawn from the item id so it stays put. */
function QR({ seed }: { seed: string }) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const cells: ReactNode[] = []
  const finder = (x: number, y: number) => x < 7 && y < 7 ? true : x > 13 && y < 7 ? true : x < 7 && y > 13
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      let on: boolean
      if (finder(x, y)) {
        const fx = x > 13 ? x - 14 : x
        const fy = y > 13 ? y - 14 : y
        on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
      } else {
        h = Math.imul(h ^ (x * 31 + y), 2654435761)
        on = (h >>> 29) % 2 === 1
      }
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />)
    }
  return <svg className="qr" viewBox="-1 -1 23 23" aria-hidden="true"><rect x={-1} y={-1} width={23} height={23} fill="#fff" />{cells}</svg>
}

function Unfolded({ item, trip, block, day, strip, onEdit }: { item: Item; trip: Trip; block?: Block; day?: string; strip?: ReactNode; onEdit?: () => void }) {
  const { pb, ps } = panels(item, trip, block, day, onEdit)
  return (
    <>
      <div className="pb">
        {pb}
        {strip && <div className="acts3">{strip}</div>}
      </div>
      <div className="ps">{ps}</div>
    </>
  )
}

function Checklist({ item, title, className }: { item: Item; title?: string; className?: string }) {
  const updateItem = useStore((s) => s.updateItem)
  const list = item.checklist ?? []
  const toggle = (id: string) => updateItem(item.id, { checklist: list.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })
  const add = () => {
    const text = prompt('Add a step')?.trim()
    if (text) updateItem(item.id, { checklist: [...list, { id: uid('c'), text, done: false }] })
  }
  return (
    <div className={className}>
      {title && <span className="cl-t">{title}</span>}
      {list.map((c) => (
        <label key={c.id} className={cx(c.done && 'done')}>
          <input type="checkbox" checked={c.done} onChange={() => toggle(c.id)} />
          <i>{c.done && <Check />}</i>
          {c.text}
        </label>
      ))}
      <button type="button" className="add" onClick={add}><Plus /> Add a step</button>
    </div>
  )
}

function panels(item: Item, trip: Trip, block: Block | undefined, day: string | undefined, onEdit?: () => void): { pb: ReactNode; ps: ReactNode } {
  const k = cardKind(item)
  const v = variantOf(item)
  const tz = trip.timezone
  const d = (id: string) => det(item, id)
  const votes = <Votes item={item} people={trip.people} block={block} />
  const span = spanOf(item, tz)
  const firstDay = item.anchors[0] ? anchorInTrip(item.anchors[0], tz).day : undefined
  const theDay = day ?? block?.day ?? firstDay

  switch (k) {
    case 'ticket': {
      const n = d('tickets')
      if (v === 'timed') {
        const ts = item.anchors.map((a) => anchorOnDay(a, theDay ?? a.day, tz)).sort((a, b) => a - b)
        const win = ts.length > 1 ? `${clock(ts[0]).slice(0, -1)}–${clock(ts[1])}` : ts.length ? clock(ts[0]) : undefined
        return {
          pb: (<>
            <div className="band"><span>TIMED ENTRY</span><span>{n ? `${n} TICKETS` : ''}</span></div>
            <div className="grid3"><KV k="Arrive" v={win} /><KV k="Stay" v={`~${fmtDuration(item.duration.typical)}`} /><KV k="Ref." v={d('ref')} /></div>
            <div className="flex items-center justify-between">{votes}<Add label="Add booking" onEdit={onEdit} /></div>
          </>),
          ps: (<><span className="sk">Admit</span><span className="sv">{n ?? '—'}</span><span className="vbars" /></>),
        }
      }
      return {
        pb: (<>
          <div className="band"><span>ADMIT {n && n !== '1' ? n : 'ONE'}</span><span>{(item.tags[0] ?? 'EVENT').toUpperCase()}</span></div>
          <div className="grid3">
            <KV k="Date" v={theDay && dayShort(theDay)} />
            {item.anchors.slice(0, 2).map((a) => <KV key={a.id} k={a.label} v={clock(anchorOnDay(a, theDay ?? a.day, tz))} />)}
          </div>
          <div className="grid3"><KV k="Section" v={d('section')} /><KV k="Row" v={d('row')} /><KV k="Seat" v={d('seat')} /></div>
          <div className="flex items-center justify-between">{votes}<Add label={d('seat') ? 'Edit seats' : 'Add seats'} onEdit={onEdit} /></div>
        </>),
        ps: (<><span className="sk">Admit</span><span className="sv">{n ?? '—'}</span><span className="vbars" /><span className="rot">{item.title.split(':')[0].toUpperCase()}</span></>),
      }
    }

    case 'pass': {
      const dep = item.anchors.find((a) => /depart|sail/i.test(a.label)) ?? item.anchors.find((a) => a.hard)
      const arr = item.anchors.find((a) => /arriv/i.test(a.label))
      const at = (a?: typeof dep) => (a ? `${clock(a.time)} ${(a.tz ?? tz).split('/')[1]?.replace('_', ' ') ?? ''}` : '--:--')
      const big = v === 'ferry' || v === 'coach'
      const rows: [string, string | undefined][] =
        v === 'train' ? [['Platform', d('platform')], ['Coach', d('coach')], ['Seat', d('seat')], ['Train', d('train')], ['Class', d('class')], ['Ticket', d('ticket')]]
        : v === 'ferry' ? [['Check-in closes', item.anchors.find((a) => /check/i.test(a.label)) && clock(item.anchors.find((a) => /check/i.test(a.label))!.time)], ['Deck', d('deck')], ['Cabin', d('cabin')], ['Vehicle', d('vehicle')], ['Terminal', d('terminal')], ['Booking', d('booking')]]
        : v === 'coach' ? [['Bay', d('bay')], ['Seat', d('seat')], ['Operator', d('operator')], ['Booking', d('booking')]]
        : isFlight(item) ? [['Boarding', item.anchors.find((a) => /board/i.test(a.label)) && clock(item.anchors.find((a) => /board/i.test(a.label))!.time)], ['Gate', d('gate')], ['Terminal', d('terminal')]]
        : [['Flight', [d('airline'), d('flight')].filter(Boolean).join(' ') || undefined], ['Boarding', item.anchors.find((a) => /board/i.test(a.label)) && clock(item.anchors.find((a) => /board/i.test(a.label))!.time)], ['Gate', d('gate')], ['Seat', d('seat')], ['Conf.', d('conf')], ['Terminal', d('terminal')]]
      return {
        pb: (<>
          <div className="route">
            <div><div className={cx('iata', big && 'sm', !d('from') && 'dash')}>{d('from') ?? '---'}</div><div className="city">{dep ? dayShort(dep.day) : ''}<br />{at(dep)}</div></div>
            <div className="pl">{isFlight(item) && item.legs.length > 1 && <span className="via">via {via(item.legs).join(' · ')}</span>}<ArrowRight /></div>
            <div className="text-right"><div className={cx('iata', big && 'sm', !d('to') && 'dash')}>{d('to') ?? '---'}</div><div className="city">{arr ? dayShort(arr.day) : ''}<br />{at(arr)}</div></div>
          </div>
          {isFlight(item) && item.legs.length > 1 && <LegList legs={item.legs} tz={tz} />}
          <div className="grid3">{rows.map(([kk, vv]) => <KV key={kk} k={kk} v={vv} />)}</div>
          <Add label={`Add ${PASS_WORD[v ?? 'flight'].toLowerCase()} details`} onEdit={onEdit} />
        </>),
        ps: (<><QR seed={item.id} /><span className="sk">{v === 'flight' || v === 'ferry' ? 'Scan at gate' : 'Show on board'}</span></>),
      }
    }

    case 'fare': {
      const z = d('zones')
      if (v === 'day' && span) {
        const days = dayRange(span.from.day, span.to.day)
        const n = theDay ? days.indexOf(theDay) : -1
        return {
          pb: (<>
            <div className="valid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
              {days.map((x, i) => <i key={x} className={cx(i < n && 'on', i === n && 'part')} />)}
            </div>
            <div className="flex justify-between font-mono text-[10.5px] opacity-90"><span>Starts {dayShort(span.from.day).split(' ')[0]} {clock(span.from.min)}</span><span>Ends {dayShort(span.to.day).split(' ')[0]} {clock(span.to.min)}</span></div>
            {d('covers') && <div className="text-[12.5px] opacity-90">{d('covers')}</div>}
          </>),
          ps: (<>{z && <Zones z={z} big />}<span className="sv" style={{ color: '#fff' }}>{d('length') ?? `${days.length}d`}</span></>),
        }
      }
      const stops = d('stops')?.split('\n').map((s) => s.trim()).filter(Boolean)
      return {
        pb: (<>
          {stops?.length ? <div className="stops">{stops.map((s) => <div key={s}>{s}</div>)}</div> : null}
          {item.notes && <div className="text-[12.5px] opacity-90">{item.notes}</div>}
          {!stops?.length && <Add label="Add stops and zones" onEdit={onEdit} />}
        </>),
        ps: (<>{z ? <Zones z={z} big /> : <TramFront size={22} />}<span className="sk">{z ? 'Zones' : 'Fare'}</span></>),
      }
    }

    case 'xfer':
      return {
        pb: (<>
          <div className="grid3"><KV k="Driver" v={d('driver')} /><KV k="Phone" v={d('phone')} /><KV k="Booking" v={d('booking')} /></div>
          {item.address && <div className="note2"><MapPin />Meet at {item.address}</div>}
          {trip.items.some((x) => cardKind(x) === 'pass' && variantOf(x) === 'flight') && <div className="note2"><PlaneLanding />If your flight lands late, give the driver a call.</div>}
        </>),
        ps: (<><span className="namesign">{d('sign') ?? 'Your name'}</span><span className="sk">Hold up</span></>),
      }

    case 'resv': {
      if (item.tbd) {
        return {
          pb: (<>
            <div className="steps">
              <label><span className="bx" />{item.tbd}</label>
              <label><span className="bx" />Paste the confirmation</label>
            </div>
            <BookedButton item={item} />
          </>),
          ps: (<>{votes}<span className="sk">Party {d('party') ?? '—'}</span></>),
        }
      }
      return {
        pb: (<>
          <div className="tent"><div className="rs">RESERVED</div><div className="nm">{item.title.split(/[(:–-]/)[0].trim()}</div><div className="rule" /></div>
          <div className="grid3"><KV k="Party" v={d('party')} /><KV k="Name" v={d('name')} /><KV k="Conf." v={d('conf')} /></div>
        </>),
        ps: theDay ? (<><span className="sk">{dayShort(theDay).split(' ')[0]}</span><span className="sv">{Number(theDay.slice(8))}</span><span className="sk">{dayShort(theDay).split(' ')[2]}</span></>) : <span className="sk">Reserved</span>,
      }
    }

    case 'key':
      return {
        pb: (<>
          <div className="stripe" />
          <div className="grid3">
            <KV k="Check in" v={span && `${dayShort(span.from.day).split(' ').slice(0, 2).join(' ')} ${clock(span.from.min)}`} />
            <KV k="Check out" v={span && `${dayShort(span.to.day).split(' ').slice(0, 2).join(' ')} ${clock(span.to.min)}`} />
            <KV k="Room" v={d('room')} />
          </div>
          <div className="grid3"><KV k="Door code" v={d('code')} /><KV k="Wifi" v={d('wifi')} /><KV k="Conf." v={d('conf')} /></div>
          <Add label={item.address ? 'Edit hotel' : 'Add hotel'} onEdit={onEdit} />
        </>),
        ps: (<><span className="chipcard big" /><span className="rot">ROOM KEY</span></>),
      }

    case 'tag': {
      if (v === 'hostel')
        return {
          pb: (<>
            <div className="grid3"><KV k="Dorm" v={d('dorm')} /><KV k="Bed" v={d('bed')} /><KV k="Check out" v={span && clock(span.to.min)} /></div>
            <div className="grid3"><KV k="Door code" v={d('code')} /><KV k="Wifi" v={d('wifi')} /></div>
          </>),
          ps: (<><span className="brass"><KeyRound /></span><span className="sk">Bed</span><span className="tm">{d('bed') ?? '—'}</span></>),
        }
      const steps = d('steps')?.split('\n').map((s) => s.trim()).filter(Boolean)
      return {
        pb: (<>
          {steps?.length ? <div className="steps2">{steps.map((s, n) => <div key={n}><b>{n + 1}</b>{s}</div>)}</div> : <Add label="Add how to get in" onEdit={onEdit} />}
          <div className="grid3"><KV k="Host" v={d('host')} /><KV k="Wifi" v={d('wifi')} /><KV k="Check out" v={span && clock(span.to.min)} /></div>
          <Checklist item={item} title="Before you leave" className="ruled2" />
        </>),
        ps: (<><span className="brass"><KeyRound /></span><span className="sk">Code</span><span className={cx('tm', !d('code') && 'dash')}>{d('code') ?? '—'}</span></>),
      }
    }

    case 'car': {
      const out = span?.from
      const back = span?.to
      return {
        pb: (<>
          <div className="form">
            <div className="fc"><span className="fl">Pick up{out ? ` · ${dayShort(out.day).split(' ').slice(0, 2).join(' ')}` : ''}</span><b>{out ? <Clock m={out.min} /> : '--:--'}</b><small>{item.address ?? '—'}</small></div>
            <div className="fc"><span className="fl">Return{back ? ` · ${dayShort(back.day).split(' ').slice(0, 2).join(' ')}` : ''}</span><b className="hard">{back ? <Clock m={back.min} /> : '--:--'}</b><small>{d('returnAt') ?? '—'}</small></div>
            <div className="fc"><span className="fl">Vehicle</span><span className="plate"><i>FIN</i><span className={cx(!d('plate') && 'dash')}>{d('plate') ?? '— — —'}</span></span><small>Bay {d('bay') ?? '—'}</small></div>
            <div className="fc"><span className="fl">Fuel out / in</span><span className="gauge"><small>E</small><span className="gt"><i /></span><small>F</small></span><small>{d('fuel') ?? 'Full to full'}</small></div>
            <div className="fc wide"><span className="fl">Condition at pick up</span><div className="dmg"><CarSketch /><small>Circle any scratches and take photos before you drive off.</small></div></div>
          </div>
          <div className="grid3"><KV k="Agreement" v={d('agreement')} /><KV k="Cover" v={d('cover')} /><KV k="Drivers" v={d('drivers')} /></div>
        </>),
        ps: <span className="rot">CUSTOMER COPY</span>,
      }
    }

    case 'voucher':
      return {
        pb: (<>
          <div className="meet"><MapPin /><div><span className="k">Meeting point</span><b>{d('meet') ?? item.address ?? 'Add the meeting point'}</b>{d('look') && <small>{d('look')}</small>}</div></div>
          <div className="grid3"><KV k="Lasts" v={`~${fmtDuration(item.duration.typical)}`} /><KV k="Operator" v={d('operator')} /><KV k="Voucher" v={d('code')} /></div>
          <div className="hbars" />
        </>),
        ps: (<><span className="sk">Present</span><span className="vbars" /><span className="rot">VOUCHER</span></>),
      }

    case 'cpass': {
      const ids = (d('covers') ?? '').split(',').filter(Boolean)
      const days = span ? dayRange(span.from.day, span.to.day) : []
      const n = theDay ? days.indexOf(theDay) : -1
      return {
        pb: (<>
          <div className="valid2"><span className="k">Valid</span><b>{span ? `${dayShort(span.from.day).split(' ')[0]} ${clock(span.from.min)} → ${dayShort(span.to.day).split(' ')[0]} ${clock(span.to.min)}` : 'Starts on first use'}</b></div>
          {ids.length > 0 && (
            <div className="covers">
              {ids.map((id) => trip.items.find((x) => x.id === id)).filter(Boolean).map((x) => <span key={x!.id}><Check />{x!.title}</span>)}
            </div>
          )}
          <Add label="Choose what it covers" onEdit={onEdit} />
        </>),
        ps: days.length ? (<><span className="ringc" style={{ '--p': `${((n + 1) / days.length) * 100}%` } as CSSProperties}><b>{Math.max(1, n + 1)}</b><small>of {days.length}</small></span><span className="sk">Days</span></>) : <span className="sk">Pass</span>,
      }
    }

    case 'post': {
      const spans = theDay ? openSpans(item.hours, theDay) : null
      const wd = theDay ? dayShort(theDay).split(' ')[0].toUpperCase() : ''
      const pm = spans == null ? ['HOURS', '?'] : spans.length === 0 ? ['CLOSED', wd] : ['OPEN', `${shortHour(spans[0][0])}–${shortHour(spans.at(-1)![1])}`, wd]
      const lines = [item.address, 'Helsinki', `~${fmtDuration(item.duration.typical)} · ${placeWord(item).toLowerCase()}`].filter(Boolean)
      return {
        pb: (<>
          <div className="back wavy">
            <div className={cx('msg', !item.notes && 'empty')}>{item.notes ?? 'Add a note…'}</div>
            <div className="lines">{lines.map((l) => <div key={l}>{l}</div>)}</div>
          </div>
          <div className="flex items-center justify-between">{votes}<Add label={item.notes ? 'Edit note' : 'Write on it'} onEdit={onEdit} /></div>
        </>),
        ps: (<><span className="postmark">{pm.map((x, n) => <span key={n}>{x}</span>)}</span><VisitedStamp item={item} day={theDay} /></>),
      }
    }

    case 'map': {
      const r = item.areaRadius ?? 400
      const inside = item.location
        ? trip.items.filter((x) => x.id !== item.id && !x.inbox && x.location && cardKind(x) !== 'map' && distanceMeters(item.location!, x.location) < r * 1.2)
        : []
      return {
        pb: (<>
          <div className="mapbig">
            <span className="ringbig" />
            {inside.slice(0, 3).map((x) => {
              const dx = ((x.location!.lng - item.location!.lng) * 111320 * Math.cos((item.location!.lat * Math.PI) / 180)) / r
              const dy = ((x.location!.lat - item.location!.lat) * 110540) / r
              return <span key={x.id} className="pin" style={{ left: `calc(50% + ${dx * 48}px)`, top: `calc(50% - ${dy * 48}px)` }}><span>{x.title}</span></span>
            })}
          </div>
          {inside.length > 0 && <span className="lbl">Also inside: {inside.map((x) => x.title).join(', ')}</span>}
        </>),
        ps: (<><span className="sk">Across</span><span className="tm">~{Math.round((r * 2) / 80)} min</span><span className="sk">on foot</span></>),
      }
    }

    case 'note':
      return {
        pb: <Checklist item={item} className="ruled" />,
        ps: <span className="sk">{(item.checklist ?? []).filter((c) => c.done).length} / {(item.checklist ?? []).length}</span>,
      }
  }
}

function BookedButton({ item }: { item: Item }) {
  const updateItem = useStore((s) => s.updateItem)
  return <button type="button" className="cta" onClick={() => updateItem(item.id, { tbd: undefined })}>Mark as booked</button>
}

/** VISITED? until you tap it, then a red stamp with the date. */
function VisitedStamp({ item, day }: { item: Item; day?: string }) {
  const updateItem = useStore((s) => s.updateItem)
  const v = item.visited
  return (
    <button
      type="button"
      className={cx('vbox tilt', v && 'done')}
      onClick={() => updateItem(item.id, { visited: v ? undefined : day ?? new Date().toISOString().slice(0, 10) })}
      aria-pressed={!!v}
      title={v ? 'Visited. Tap to undo' : 'Tap when you’ve been'}
    >
      {v ? (<>VISITED<br />{Number(v.slice(8))} {dayShort(v).split(' ')[2].toUpperCase()}</>) : 'VISITED?'}
    </button>
  )
}

function CarSketch() {
  return (
    <svg className="carsvg" viewBox="0 0 120 50" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="8" y="7" width="104" height="36" rx="14" />
        <rect x="38" y="13" width="36" height="24" rx="4" />
        <path d="M80 11 Q88 25 80 39 M30 11 Q24 25 30 39" />
      </g>
      <g fill="currentColor">
        <rect x="24" y="3" width="14" height="5" rx="2" />
        <rect x="82" y="3" width="14" height="5" rx="2" />
        <rect x="24" y="42" width="14" height="5" rx="2" />
        <rect x="82" y="42" width="14" height="5" rx="2" />
      </g>
    </svg>
  )
}
