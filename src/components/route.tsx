import { MapPin, Navigation } from 'lucide-react'
import type { CSSProperties } from 'react'
import { fmtDuration } from '../lib/time'
import { Clock } from './objects'

// Next up, drawn on a scrap of street map: ✕ where you are, a dotted stretch
// for your free time, the transit leg in its color, and a flag where you need
// to leave. The flag slides back toward the ✕ as the free time runs out.

type P = [number, number]
const SEGS: [P, P, P, P][] = [
  [[16, 60], [70, 18], [120, 76], [168, 44]],
  [[168, 44], [212, 18], [252, 36], [284, 26]],
]
/** Where the 300×80 route drawing starts inside the map area. */
const OFF = 40
const D = 'M16 60 C70 18 120 76 168 44 C212 18 252 36 284 26'

const bez = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]) as P
}

// Sample the path once so a fraction of its length maps to a point on it.
const PTS: { p: P; at: number }[] = (() => {
  const pts: P[] = []
  for (const s of SEGS) for (let i = 0; i <= 200; i++) pts.push(bez(...s, i / 200))
  let len = 0
  return pts.map((p, i) => {
    if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])
    return { p, at: len }
  })
})()
const TOTAL = PTS[PTS.length - 1].at

function pointAt(f: number): P {
  const want = Math.max(0, Math.min(1, f)) * TOTAL
  return (PTS.find((x) => x.at >= want) ?? PTS[PTS.length - 1]).p
}

export interface RouteCardProps {
  title: string
  now: number
  /** When to set off (start minus travel). */
  leave: number
  /** When the plan starts. */
  arrive: number
  /** e.g. "Tram 21 min"; empty when there's no leg to travel. */
  leg?: string
  color?: string
  directions?: string
  onLate?: (min: number) => void
  onOpen?: () => void
}

export function RouteCard({ title, now, leave, arrive, leg, color = '#00985f', directions, onLate, onOpen }: RouteCardProps) {
  const free = leave - now
  const st = free > 30 ? '#1f5fbf' : free > 10 ? '#b45309' : '#c8102e'
  const span = Math.max(1, arrive - now)
  const f = leg ? Math.max(0, Math.min(1, free / span)) : 1
  const [x, y] = pointAt(f)
  const xp = (x / 300) * 100
  const anchor = xp > 70 ? '-85%' : xp < 30 ? '-15%' : '-50%'
  const head = !leg ? `Starts in ${fmtDuration(Math.max(0, arrive - now))}` : free > 10 ? `Leave in ${fmtDuration(free)}` : free >= 0 ? 'Leave now' : `${-free} min behind`
  return (
    <div className="rcard" style={{ '--st': st } as CSSProperties}>
      <button type="button" className="rtap" onClick={onOpen} aria-label={`${title}: ${head}`}>
        <div className="rhd"><span>Next up</span><span className="rin">{head}</span></div>
        <div className="rmap">
          <div className="rtt">{title}</div>
          <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
            <path d={D} fill="none" stroke="#7d8591" strokeWidth="2.4" strokeDasharray="1 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {leg && <path d={D} pathLength={100} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`0 ${(f * 100).toFixed(2)} 100`} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          <span className="you" style={{ left: `${16 / 3}%`, top: OFF + 60 }}>✕</span>
          <span className="ylab">You · <Clock m={now} /></span>
          <span className="pin" style={{ left: `${284 / 3}%`, top: OFF + 26 }}><MapPin /></span>
          <span className="dlab">Arrive <Clock m={arrive} /></span>
          {leg && (
            <>
              <span className="lv" style={{ left: `${xp}%`, top: OFF + y }} />
              <span className="flag" style={{ left: `${xp}%`, top: OFF + y, transform: `translateX(${anchor}) translateY(calc(-100% - 9px))` }}>
                <small>Leave</small>
                <span><Clock m={leave} /></span>
              </span>
            </>
          )}
          <span className="leg">{leg ? `${free > 0 ? `${fmtDuration(free)} free · ` : ''}${leg}` : 'No travel needed'}</span>
        </div>
      </button>
      <div className="rstrip">
        {directions ? (
          <a className="rgo" href={directions} target="_blank" rel="noreferrer"><Navigation />Directions</a>
        ) : <span />}
        {onLate && (
          <span className="rlate">
            Late?
            {[15, 30, 60].map((m) => (
              <button key={m} type="button" onClick={() => onLate(m)}>+{m}</button>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
