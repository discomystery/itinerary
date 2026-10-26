import { useMemo, useState } from 'react'
import { cx, InterestDots, SEVERITY_STYLE, TYPE_META } from '../components/ui'
import { hoursSummary, openStatus } from '../lib/hours'
import { applyDay, runningLate, type LateResult } from '../lib/reflow'
import { anchorOnDay, dayBlocks, interestScore, makeCtx } from '../lib/schedule'
import { dayLabel, fmtDuration, fmtTime, toHHMM, wallToUtc } from '../lib/time'
import { directionsUrl, distanceMeters, fmtDistance, MODE_ICON, suggestMode, travelMinutes } from '../lib/transit'
import { useNow } from '../lib/useNow'
import { itemById, useStore } from '../store'
import type { Block, LatLng } from '../types'

export default function NowView() {
  const trip = useStore((s) => s.trip)
  const now = useNow()
  const inTrip = now.day >= trip.startDay && now.day <= trip.endDay
  const ctx = useMemo(() => makeCtx(trip), [trip])
  const today = dayBlocks(trip, now.day)
  const current = today.find((b) => b.start <= now.min && b.end > now.min)
  const upcoming = today.filter((b) => b.start > now.min)
  const next = upcoming[0]
  const prevLoc = [...today].reverse().find((b) => b.start <= now.min && ctx.loc(b))
  const here = (current && ctx.loc(current)) ?? (prevLoc && ctx.loc(prevLoc)) ?? trip.center

  // Next hard moment today (e.g. puck drop).
  const hard = today
    .flatMap((b) => itemById(trip, b.itemId)!.anchors.filter((a) => a.hard).map((a) => ({ b, a, t: anchorOnDay(a, now.day, trip.timezone) })))
    .filter((x) => x.t > now.min)
    .sort((x, y) => x.t - y.t)[0]

  return (
    <div className="space-y-3 p-3">
      <SimControl inTrip={inTrip} />

      {inTrip && (
        <>
          {current && <NowCard label="Now" block={current} now={now.min} />}
          {next && <NextCard block={next} from={current ?? prevLoc} now={now.min} />}
          {!current && !next && (
            <div className="card p-4 text-sm text-slate-600">Nothing else on the plan today. Here's what's open nearby 👇</div>
          )}
          {hard && (
            <div className="card flex items-center gap-3 border-rose-200 bg-rose-50 p-3">
              <span className="text-2xl">🔒</span>
              <div className="flex-1 text-sm">
                <div className="font-semibold">{hard.a.label}: {itemById(trip, hard.b.itemId)!.title}</div>
                <div className="text-rose-800">at {fmtTime(hard.t)}, in {fmtDuration(hard.t - now.min)}</div>
              </div>
            </div>
          )}
          {(current || next) && <RunningLate day={now.day} now={now.min} />}
          <OpenNearby here={here} day={now.day} now={now.min} />
        </>
      )}
    </div>
  )
}

function SimControl({ inTrip }: { inTrip: boolean }) {
  const trip = useStore((s) => s.trip)
  const simNow = useStore((s) => s.simNow)
  const setSimNow = useStore((s) => s.setSimNow)
  const now = useNow()
  const daysAway = Math.round((Date.parse(trip.startDay) - Date.parse(now.day)) / 86400000)
  const set = (day: string, min: number) => setSimNow(wallToUtc(trip.timezone, day, min))
  return (
    <div className={cx('card p-3', now.simulated && 'border-violet-300 bg-violet-50')}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-2xl font-semibold tabular-nums">{fmtTime(now.min)}</div>
          <div className="text-xs text-slate-500">
            {dayLabel(now.day, 'long')} · {trip.timezone.split('/')[1]?.replace('_', ' ')} time
            {now.simulated && <b className="text-violet-700"> · pretend mode</b>}
          </div>
        </div>
        {simNow != null && <button className="btn-soft" onClick={() => setSimNow(null)}>Back to real time</button>}
      </div>
      {!inTrip && !now.simulated && (
        <p className="mt-2 text-sm text-slate-600">
          {daysAway > 0 ? `Trip starts in ${daysAway} day${daysAway === 1 ? '' : 's'}.` : 'The trip is over.'} You can preview this screen by pretending it's a time during the trip:
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
          <button className="btn-soft py-1" onClick={() => set(trip.blocks.find((b) => b.locked)?.day ?? trip.startDay, 14 * 60)}>
            Try a game day, 2pm
          </button>
        )}
        {now.simulated && (
          <>
            <button className="btn-soft py-1" onClick={() => setSimNow((simNow ?? Date.now()) + 15 * 60000)}>+15m</button>
            <button className="btn-soft py-1" onClick={() => setSimNow((simNow ?? Date.now()) + 60 * 60000)}>+1h</button>
          </>
        )}
      </div>
    </div>
  )
}

function NowCard({ label, block, now }: { label: string; block: Block; now: number }) {
  const trip = useStore((s) => s.trip)
  const item = itemById(trip, block.itemId)!
  const pct = Math.min(100, Math.max(0, ((now - block.start) / (block.end - block.start)) * 100))
  return (
    <div className="card overflow-hidden">
      <div className="h-1 bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      <div className="p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">{label}</div>
        <div className="text-lg font-semibold">{TYPE_META[item.type].icon} {item.title}</div>
        <div className="text-sm text-slate-600">until {fmtTime(block.end)} · {fmtDuration(block.end - now)} left</div>
      </div>
    </div>
  )
}

function NextCard({ block, from, now }: { block: Block; from?: Block; now: number }) {
  const trip = useStore((s) => s.trip)
  const ctx = makeCtx(trip)
  const item = itemById(trip, block.itemId)!
  const travel = from ? ctx.travel(from, block) : 0
  const mode = from ? ctx.mode(from, block) : trip.defaultMode
  const leaveBy = block.start - travel
  const late = leaveBy < now
  const to = item.location
  return (
    <div className={cx('card p-3', late && 'border-amber-300')}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Next up · {fmtTime(block.start)}</div>
      <div className="text-lg font-semibold">{TYPE_META[item.type].icon} {item.title} {block.locked && '🔒'}</div>
      {travel > 0 ? (
        <div className={cx('mt-1 text-sm', late ? 'text-amber-800' : 'text-slate-700')}>
          {late ? (
            <>⚠️ Should have left {fmtDuration(now - leaveBy)} ago</>
          ) : (
            <>Leave by <b>{fmtTime(leaveBy)}</b> (in {fmtDuration(leaveBy - now)})</>
          )}{' '}
          · {MODE_ICON[mode]} ~{travel}m
        </div>
      ) : (
        <div className="mt-1 text-sm text-slate-700">Starts in {fmtDuration(block.start - now)}</div>
      )}
      {to && (
        <a className="mt-2 inline-block text-sm font-medium text-sky-700" href={directionsUrl(from && ctx.loc(from), to, mode)} target="_blank" rel="noreferrer">
          Directions ↗
        </a>
      )}
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
    <div className="card p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Running late?</span>
        <div className="ml-auto flex gap-1">
          {[10, 15, 30, 60].map((m) => (
            <button key={m} onClick={() => { setDelay(delay === m ? null : m); setDone(null) }} className={cx('rounded-md px-2.5 py-1 text-sm', delay === m ? 'bg-slate-900 text-white' : 'bg-slate-100')}>
              +{m}
            </button>
          ))}
        </div>
      </div>
      {done && <p className="mt-2 text-sm text-emerald-700">✓ {done}. Undo is at the top if you change your mind.</p>}
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          {result.base.overruns.length === 0 ? (
            <>
              {result.base.moved.length === 0 ? (
                <p className="text-slate-600">No problem. Nothing else needs to move.</p>
              ) : (
                <>
                  <p className="text-slate-600">Free time absorbs most of it. These shift:</p>
                  <ShiftList before={trip.blocks} after={result.base.blocks} ids={result.base.moved} title={title} />
                  <button className="btn w-full" onClick={() => apply(result.base.blocks, [], `Shifted ${result.base.moved.length} plan(s)`)}>
                    Shift them
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p className={cx('rounded-md border px-2 py-1.5', SEVERITY_STYLE.error)}>
                ⛔ Pushing everything back makes you ~{result.base.overruns[0].minutes}m late for <b>{title(result.base.overruns[0].blockId)}</b>, which has a fixed time.
              </p>
              {result.suggestions.length === 0 && <p className="text-slate-600">No easy fix. Open the Plan tab to rework the day by hand.</p>}
              {result.suggestions.map((s) => (
                <button key={s.id} onClick={() => apply(s.blocks, s.dropped, s.label)} className="flex w-full flex-col items-start rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-slate-500">{s.detail}</span>
                </button>
              ))}
              <button className="btn-soft w-full" onClick={() => apply(result.base.blocks, [], 'Shifted plans (still late for the fixed one)')}>
                Just shift everything anyway
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ShiftList({ before, after, ids, title }: { before: Block[]; after: Block[]; ids: string[]; title: (id: string) => string }) {
  return (
    <ul className="space-y-0.5 text-xs text-slate-600">
      {ids.map((id) => {
        const a = before.find((b) => b.id === id)!
        const b = after.find((x) => x.id === id)!
        return (
          <li key={id}>
            <b>{title(id)}</b>: {fmtTime(a.start)}–{fmtTime(a.end)} → {fmtTime(b.start)}–{fmtTime(b.end)}
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

  const list = trip.items
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
    <div className="card p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Open now, nearby</span>
        <span className="text-xs text-slate-500">{free < 600 ? `${fmtDuration(free)} free` : 'rest of the day free'}</span>
      </div>
      <ul className="space-y-2">
        {list.map(({ i, mode, travel, arrive, status, fits, dist }) => (
          <li key={i.id} className={cx('flex items-center gap-2', !fits && 'opacity-60')}>
            <span className="text-lg">{TYPE_META[i.type].icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{i.title}</div>
              <div className="truncate text-xs text-slate-500">
                {MODE_ICON[mode]} {travel}m · {fmtDistance(dist)}
                {status === 'open' ? ` · open ${hoursSummary(i.hours, day, fmtTime)}` : ' · hours unknown'}
                {!fits && ' · not enough time'}
              </div>
              <InterestDots item={i} people={trip.people} />
            </div>
            <button
              className="btn-soft shrink-0 px-2.5 py-1"
              onClick={() => addBlock({ itemId: i.id, day, start: Math.ceil(arrive / 5) * 5, end: Math.ceil(arrive / 5) * 5 + Math.min(i.duration.typical, Math.max(i.duration.min, free - travel)), locked: false })}
            >
              Go
            </button>
          </li>
        ))}
        {!list.length && <li className="text-sm text-slate-500">Nothing on your list is open nearby right now.</li>}
      </ul>
    </div>
  )
}
