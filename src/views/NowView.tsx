import { ChevronRight, CircleAlert, Lock, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { clock, glyphFor, ObjectCard } from '../components/objects'
import { Horizon, LegPill, LegSheet } from '../components/rail'
import { cx, Votes } from '../components/ui'
import { hoursSummary, openStatus } from '../lib/hours'
import { applyDay, runningLate, type LateResult } from '../lib/reflow'
import { analyzeDay, anchorOnDay, dayBlocks, interestScore, type Leg, makeCtx } from '../lib/schedule'
import { dayLabel, fmtDuration, toHHMM, wallToUtc } from '../lib/time'
import { distanceMeters, fmtDistance, suggestMode, travelMinutes } from '../lib/transit'
import { MODE_STYLE } from '../components/rail'
import { useNow } from '../lib/useNow'
import { ideas, itemById, useStore } from '../store'
import type { Block, LatLng } from '../types'

export default function NowView() {
  const trip = useStore((s) => s.trip)
  const setTab = useStore((s) => s.setTab)
  const setDay = useStore((s) => s.setDay)
  const now = useNow()
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  const inTrip = now.day >= trip.startDay && now.day <= trip.endDay
  const ctx = useMemo(() => makeCtx(trip), [trip])
  const analysis = useMemo(() => analyzeDay(trip, now.day), [trip, now.day])
  const today = dayBlocks(trip, now.day)
  const current = today.find((b) => b.start <= now.min && b.end > now.min)
  const upcoming = today.filter((b) => b.start > now.min)
  const next = upcoming[0]
  const after = upcoming[1]
  const prevLoc = [...today].reverse().find((b) => b.start <= now.min && ctx.loc(b))
  const here = (current && ctx.loc(current)) ?? (prevLoc && ctx.loc(prevLoc)) ?? trip.center
  const legTo = (b?: Block) => (b ? analysis.legs.find((l) => l.toId === b.id && l.minutes > 0) : undefined)
  const open = (b: Block) => {
    setDay(b.day)
    setTab('plan')
  }

  // Next hard moment today (e.g. puck drop).
  const hard = today
    .flatMap((b) => itemById(trip, b.itemId)!.anchors.filter((a) => a.hard).map((a) => ({ b, a, t: anchorOnDay(a, now.day, trip.timezone) })))
    .filter((x) => x.t > now.min)
    .sort((x, y) => x.t - y.t)[0]

  const nextLeg = legTo(next)
  const afterLeg = legTo(after)

  return (
    <div className="flex flex-col gap-2 px-3 pb-8 pt-3">
      <SimControl inTrip={inTrip} />

      {inTrip && (
        <>
          <div className="panel px-4">
            <Horizon trip={trip} day={now.day} now={now.min} />
          </div>
          {hard && (
            <div className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-white" style={{ background: '#14243b' }}>
              <Lock size={16} color="#ff7b8a" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[.08em]" style={{ color: '#9fb4d4' }}>Next fixed time</div>
                <div className="truncate text-[13px]">{hard.a.label} · {itemById(trip, hard.b.itemId)!.title}</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-extrabold leading-none" style={{ color: "#ff7b8a", fontFamily: "var(--cond)" }}>{clock(hard.t)}</div>
                <div className="font-mono text-[10px]" style={{ color: '#9fb4d4' }}>in {fmtDuration(hard.t - now.min)}</div>
              </div>
            </div>
          )}

          {current && (
            <ObjectCard
              item={itemById(trip, current.itemId)!}
              block={current}
              tz={trip.timezone}
              issues={analysis.issues.get(current.id)}
              eyebrow={`Now · ${fmtDuration(current.end - now.min)} left`}
              onClick={() => open(current)}
            />
          )}
          {next && nextLeg && <LateAwareLeg leg={nextLeg} now={now.min} onOpen={() => setOpenLeg(nextLeg)} />}
          {next && (
            <ObjectCard
              item={itemById(trip, next.itemId)!}
              block={next}
              tz={trip.timezone}
              issues={analysis.issues.get(next.id)}
              eyebrow={`Next · in ${fmtDuration(next.start - now.min)}`}
              onClick={() => open(next)}
            />
          )}
          {after && afterLeg && <LegPill trip={trip} leg={afterLeg} onOpen={() => setOpenLeg(afterLeg)} />}
          {after && (
            <ObjectCard item={itemById(trip, after.itemId)!} block={after} tz={trip.timezone} issues={analysis.issues.get(after.id)} onClick={() => open(after)} />
          )}
          {!current && !next && <div className="panel text-sm t-sub">Nothing else on the plan today. Here's what's open nearby.</div>}

          {(current || next) && <RunningLate day={now.day} now={now.min} />}
          <OpenNearby here={here} day={now.day} now={now.min} />
        </>
      )}
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
    </div>
  )
}

/** The leg to the next plan, flagged if it's already time to go. */
function LateAwareLeg({ leg, now, onOpen }: { leg: Leg; now: number; onOpen: () => void }) {
  const trip = useStore((s) => s.trip)
  const to = trip.blocks.find((b) => b.id === leg.toId)!
  const leave = to.start - leg.minutes
  if (leave > now) return <LegPill trip={trip} leg={leg} onOpen={onOpen} />
  return <LegPill trip={trip} leg={{ ...leg, tight: true, gap: leg.minutes - (now - leave) }} onOpen={onOpen} />
}

function SimControl({ inTrip }: { inTrip: boolean }) {
  const trip = useStore((s) => s.trip)
  const simNow = useStore((s) => s.simNow)
  const setSimNow = useStore((s) => s.setSimNow)
  const now = useNow()
  const daysAway = Math.round((Date.parse(trip.startDay) - Date.parse(now.day)) / 86400000)
  const set = (day: string, min: number) => setSimNow(wallToUtc(trip.timezone, day, min))
  return (
    <div className="panel" style={now.simulated ? { boxShadow: 'inset 0 0 0 1.5px #7c5cd6' } : undefined}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[28px] font-bold leading-tight tracking-tight tabular-nums">{clock(now.min)}</div>
          <div className="text-xs t-sub">
            {dayLabel(now.day, 'long')} · {trip.timezone.split('/')[1]?.replace('_', ' ')} time
            {now.simulated && <b style={{ color: '#7c5cd6' }}> · pretend mode</b>}
          </div>
        </div>
        {simNow != null && <button className="btn-soft" onClick={() => setSimNow(null)}>Real time</button>}
      </div>
      {!inTrip && !now.simulated && (
        <p className="mt-2 text-sm t-sub">
          {daysAway > 0 ? `Trip starts in ${daysAway} day${daysAway === 1 ? '' : 's'}.` : 'The trip is over.'} Preview this screen by pretending it's a time during the trip:
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          type="datetime-local"
          className="input w-auto py-1 text-sm"
          value={`${now.day}T${toHHMM(now.min)}`}
          onChange={(e) => {
            const [d, t] = e.target.value.split('T')
            if (d && t) set(d, Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
          }}
        />
        {!inTrip && (
          <button className="btn-soft py-1.5" onClick={() => set(trip.blocks.find((b) => b.locked)?.day ?? trip.startDay, 14 * 60)}>
            Try a game day, 2pm
          </button>
        )}
        {now.simulated && (
          <>
            <button className="btn-soft py-1.5 font-mono text-xs" onClick={() => setSimNow((simNow ?? Date.now()) + 15 * 60000)}>+15m</button>
            <button className="btn-soft py-1.5 font-mono text-xs" onClick={() => setSimNow((simNow ?? Date.now()) + 60 * 60000)}>+1h</button>
          </>
        )}
      </div>
    </div>
  )
}

function RunningLate({ day, now }: { day: string; now: number }) {
  const trip = useStore((s) => s.trip)
  const setBlocks = useStore((s) => s.setBlocks)
  const [delay, setDelay] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const result: LateResult | null = useMemo(() => (delay ? runningLate(trip, day, now, delay) : null), [trip, day, now, delay])
  const title = (id: string) => itemById(trip, trip.blocks.find((b) => b.id === id)?.itemId ?? '')?.title ?? ''

  const apply = (blocks: Block[], dropped: string[], msg: string) => {
    setBlocks(applyDay(trip, day, blocks, dropped))
    setDelay(null)
    setDone(msg)
  }

  return (
    <div className="panel">
      <div className="flex items-center gap-2">
        <span className="label">Running late?</span>
        <div className="seg ml-auto grid-cols-4" style={{ width: 200 }}>
          {[10, 15, 30, 60].map((m) => (
            <button key={m} aria-pressed={delay === m} onClick={() => { setDelay(delay === m ? null : m); setDone(null) }}>+{m}</button>
          ))}
        </div>
      </div>
      {done && <p className="mt-2 text-sm" style={{ color: '#15803d' }}>Done: {done}. Undo is at the top if you change your mind.</p>}
      {result && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {result.base.overruns.length === 0 ? (
            result.base.moved.length === 0 ? (
              <p className="t-sub">No problem. Nothing else needs to move.</p>
            ) : (
              <>
                <p className="t-sub">Free time absorbs most of it. These shift:</p>
                <ShiftList before={trip.blocks} after={result.base.blocks} ids={result.base.moved} title={title} />
                <button className="btn w-full" onClick={() => apply(result.base.blocks, [], `shifted ${result.base.moved.length} plan(s)`)}>Shift them</button>
              </>
            )
          ) : (
            <>
              <p className="flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>
                <CircleAlert size={16} className="mt-0.5 flex-none" />
                <span>Pushing everything back makes you ~{result.base.overruns[0].minutes} min late for <b>{title(result.base.overruns[0].blockId)}</b>, which has a fixed time.</span>
              </p>
              {result.suggestions.length === 0 && <p className="t-sub">No easy fix. Open the Plan tab to rework the day.</p>}
              {result.suggestions.map((s) => (
                <button key={s.id} onClick={() => apply(s.blocks, s.dropped, s.label.toLowerCase())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.label}</span>
                    <span className="block text-xs t-sub">{s.detail}</span>
                  </span>
                  <ChevronRight size={16} className="t-sub" />
                </button>
              ))}
              <button className="btn-soft w-full" onClick={() => apply(result.base.blocks, [], 'shifted plans (still late for the fixed one)')}>Shift everything anyway</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ShiftList({ before, after, ids, title }: { before: Block[]; after: Block[]; ids: string[]; title: (id: string) => string }) {
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-xs t-sub">
      {ids.map((id) => {
        const a = before.find((b) => b.id === id)!
        const b = after.find((x) => x.id === id)!
        return (
          <li key={id}>
            <b className="font-sans" style={{ color: 'var(--ink)' }}>{title(id)}</b> {clock(a.start)} → {clock(b.start)}
          </li>
        )
      })}
    </ul>
  )
}

function OpenNearby({ here, day, now }: { here: LatLng; day: string; now: number }) {
  const trip = useStore((s) => s.trip)
  const addBlock = useStore((s) => s.addBlock)
  const today = dayBlocks(trip, day)
  const nextStart = today.find((b) => b.start > now)?.start ?? 26 * 60
  const free = nextStart - now
  const onToday = new Set(today.map((b) => b.itemId))

  const list = ideas(trip)
    .filter((i) => i.location && !onToday.has(i.id) && i.type !== 'transport' && !i.anchors.length)
    .map((i) => {
      const mode = suggestMode(here, i.location!, trip.defaultMode)
      const travel = travelMinutes(here, i.location!, mode)
      const arrive = now + travel
      const status = openStatus(i.hours, day, arrive, arrive + i.duration.min)
      const fits = travel + i.duration.min <= free
      return { i, mode, travel, arrive, status, fits, dist: distanceMeters(here, i.location!) }
    })
    .filter((x) => x.status !== 'closed' && x.status !== 'partial')
    .sort((a, b) => Number(b.fits) - Number(a.fits) || interestScore(b.i) - interestScore(a.i) || a.dist - b.dist)
    .slice(0, 8)

  return (
    <div className="panel mt-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="label">Open now, nearby</span>
        <span className="ml-auto font-mono text-[11px] t-sub">{free < 600 ? `${fmtDuration(free)} free` : 'rest of the day free'}</span>
      </div>
      <ul className="flex flex-col">
        {list.map(({ i, mode, travel, arrive, status, fits, dist }) => {
          const Glyph = glyphFor(i)
          const M = MODE_STYLE[mode].Icon
          return (
            <li key={i.id} className={cx('flex items-center gap-3 border-t b-line py-2 first:border-t-0', !fits && 'opacity-55')}>
              <Glyph size={18} className="flex-none t-sub" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{i.title}</div>
                <div className="flex items-center gap-1 truncate font-mono text-[11px] t-sub">
                  <M size={12} /> {travel} min · {fmtDistance(dist)}
                  {status === 'open' ? ` · ${hoursSummary(i.hours, day, clock)}` : ' · hours unknown'}
                  {!fits && ' · not enough time'}
                </div>
              </div>
              <Votes item={i} people={trip.people} />
              <button
                className="btn-soft h-8 shrink-0 px-3 py-0"
                onClick={() => {
                  const s = Math.ceil(arrive / 5) * 5
                  addBlock({ itemId: i.id, day, start: s, end: s + Math.min(i.duration.typical, Math.max(i.duration.min, free - travel)), locked: false })
                }}
              >
                <Plus size={14} /> Go
              </button>
            </li>
          )
        })}
        {!list.length && <li className="text-sm t-sub">Nothing on your list is open nearby right now.</li>}
      </ul>
    </div>
  )
}
