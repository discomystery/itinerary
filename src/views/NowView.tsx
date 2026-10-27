import { ChevronRight, CircleAlert, Map as MapIcon, Plus, Sunset, Ticket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Clock, clock, glyphFor, ObjectCard } from '../components/objects'
import { Horizon, leaveAt, LegPill, LegSheet, MODE_STYLE } from '../components/rail'
import { Ribbons } from '../components/ribbons'
import { RouteCard } from '../components/route'
import { cx, Sheet, ViewHeader, Votes } from '../components/ui'
import { cardKind, det } from '../lib/cards'
import { daylight, hoursSummary, openStatus } from '../lib/hours'
import { applyDay, runningLate, type LateResult } from '../lib/reflow'
import { useFetchRoutes, useRoutes } from '../lib/routeCache'
import { analyzeDay, anchorOnDay, dayBlocks, interestScore, type Leg, makeCtx } from '../lib/schedule'
import { dayLabel, fmtDuration, toHHMM, wallToUtc } from '../lib/time'
import { directionsUrl, distanceMeters, fmtDistance, suggestMode, travelMinutes } from '../lib/transit'
import { flightStatus, isFlight } from '../lib/flights'
import { useNow } from '../lib/useNow'
import { ideas, itemById, useStore } from '../store'
import type { Block, Item, LatLng } from '../types'

/** "Now · 2h left", or for a flight, which leg you're on or how long the layover has left. */
function nowEyebrow(item: Item, left: number, utc: number, tz: string): string {
  if (isFlight(item)) {
    const st = flightStatus(item.legs, utc, tz)
    if (st.kind === 'leg') return `Now · ${st.leg.flightNo ? `${st.leg.flightNo} ` : ''}to ${st.leg.to.toUpperCase()} · lands in ${fmtDuration(st.minutesLeft)}`
    if (st.kind === 'layover') return `Now · layover in ${st.layover.at} · next flight in ${fmtDuration(st.minutesLeft)}`
  }
  return `Now · ${fmtDuration(left)} left`
}

export default function NowView() {
  const trip = useStore((s) => s.trip)
  const setTab = useStore((s) => s.setTab)
  const setDay = useStore((s) => s.setDay)
  const mapsApp = useStore((s) => s.mapsApp)
  const now = useNow()
  const [openLeg, setOpenLeg] = useState<Leg | null>(null)
  const [late, setLate] = useState<number | null>(null)
  const inTrip = now.day >= trip.startDay && now.day <= trip.endDay
  const routes = useRoutes((s) => s.routes)
  const ctx = useMemo(() => makeCtx(trip, routes), [trip, routes])
  const analysis = useMemo(() => analyzeDay(trip, now.day, makeCtx(trip, routes)), [trip, routes, now.day])
  useFetchRoutes(analysis.missing)
  const today = dayBlocks(trip, now.day)
  const current = today.find((b) => b.start <= now.min && b.end > now.min)
  const upcoming = today.filter((b) => b.start > now.min)
  const next = upcoming[0]
  const prevLoc = [...today].reverse().find((b) => b.start <= now.min && ctx.loc(b))
  const here = (current && ctx.loc(current)) ?? (prevLoc && ctx.locEnd(prevLoc)) ?? trip.center
  const legTo = (b?: Block) => (b ? analysis.legs.find((l) => l.toId === b.id && l.minutes > 0) : undefined)
  const open = (b: Block) => {
    setDay(b.day)
    setTab('plan')
  }
  const city = trip.timezone.split('/')[1]?.replace('_', ' ')

  // Next hard moment today (e.g. puck drop).
  const hard = today
    .flatMap((b) => itemById(trip, b.itemId)!.anchors.filter((a) => a.hard).map((a) => ({ b, a, t: anchorOnDay(a, now.day, trip.timezone) })))
    .filter((x) => x.t > now.min && x.t < 1440 + 360)
    .sort((x, y) => x.t - y.t)[0]

  const nextLeg = legTo(next)
  const nextItem = next && itemById(trip, next.itemId)
  const nextLoc = next && ctx.loc(next)
  const legsLeft = analysis.legs.filter((l) => l.minutes > 0 && (trip.blocks.find((b) => b.id === l.toId)?.start ?? 0) > now.min)
  // Show the plan in progress, then the next few, with the legs between them.
  const list = [current, ...upcoming].filter((b): b is Block => !!b).slice(0, 3)

  return (
    <div>
      <ViewHeader
        title="Now"
        sub={<>{dayLabel(now.day, 'long').split(',')[0]} · {clock(now.min)} {city} time{now.simulated && <b style={{ color: '#7c5cd6' }}> · pretend</b>}</>}
        right={<button className="ib" onClick={() => setTab('map')} aria-label="Map"><MapIcon /></button>}
      >
        {inTrip && <Horizon trip={trip} day={now.day} now={now.min} />}
      </ViewHeader>

      <div className="desk">
        <SimControl inTrip={inTrip} />

        {inTrip && (
          <>
            {next && nextItem && (
              <RouteCard
                title={nextItem.title}
                now={now.min}
                leave={nextLeg ? leaveAt(trip, nextLeg) : next.start}
                arrive={next.start}
                leg={nextLeg ? `${nextLeg.line ?? MODE_STYLE[nextLeg.mode].name} ${nextLeg.minutes} min` : undefined}
                color={nextLeg ? MODE_STYLE[nextLeg.mode].c : undefined}
                directions={nextLoc ? directionsUrl(here, nextLoc, nextLeg?.mode ?? trip.defaultMode, mapsApp) : undefined}
                onLate={setLate}
                onOpen={() => open(next)}
              />
            )}

            <div className="stubs">
              {hard ? (
                <button className="stub tix" onClick={() => open(hard.b)}>
                  <span className="sk2"><Ticket />{hard.a.label.replace(' (est.)', '')}</span>
                  <b><Clock m={hard.t} /></b>
                  <small>in {fmtDuration(hard.t - now.min)} · {itemById(trip, hard.b.itemId)!.title.split(':')[0]}</small>
                </button>
              ) : (
                <DuskStub day={now.day} now={now.min} />
              )}
              <TransitStub legs={legsLeft} />
            </div>

            <div className="sl"><span>Today</span>{today[0] && <button onClick={() => open(today[0])}>Full plan</button>}</div>
            <Ribbons day={now.day} />
            {list.map((b, n) => {
              const leg = n > 0 ? legTo(b) : undefined
              return (
                <div key={b.id} className="contents">
                  {leg && <LateAwareLeg leg={leg} now={now.min} onOpen={() => setOpenLeg(leg)} />}
                  <ObjectCard
                    item={itemById(trip, b.itemId)!}
                    block={b}
                    tz={trip.timezone}
                    issues={analysis.issues.get(b.id)}
                    eyebrow={b === current ? nowEyebrow(itemById(trip, b.itemId)!, b.end - now.min, wallToUtc(trip.timezone, now.day, now.min), trip.timezone) : undefined}
                    onClick={() => open(b)}
                  />
                </div>
              )
            })}
            {!list.length && <div className="pn text-sm t-sub">Nothing else on the plan today. Here's what's open nearby.</div>}

            <OpenNearby here={here} day={now.day} now={now.min} />
          </>
        )}
      </div>
      {openLeg && <LegSheet leg={openLeg} onClose={() => setOpenLeg(null)} />}
      {late != null && <RunningLate day={now.day} now={now.min} initial={late} onClose={() => setLate(null)} />}
    </div>
  )
}

/** With no fixed time left today, the stub counts down to sunset instead. */
function DuskStub({ day, now }: { day: string; now: number }) {
  const trip = useStore((s) => s.trip)
  const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
  const before = dl && now < dl.sunset
  return (
    <div className="stub tix dusk">
      <span className="sk2"><Sunset />{before ? 'Sunset' : 'Nothing fixed'}</span>
      <b>{before ? <Clock m={dl!.sunset} /> : 'Free'}</b>
      <small>{before ? `in ${fmtDuration(dl!.sunset - now)}` : 'the rest of today'}</small>
    </div>
  )
}

/** Travel still ahead today, printed like a fare card. */
function TransitStub({ legs }: { legs: Leg[] }) {
  const trip = useStore((s) => s.trip)
  const mode = trip.defaultMode
  const M = MODE_STYLE[mode]
  const mins = legs.reduce((a, l) => a + l.minutes, 0)
  const fare = mode === 'transit' ? trip.items.find((i) => cardKind(i) === 'fare' && det(i, 'zones')) : undefined
  const zones = fare ? det(fare, 'zones')!.replace(/[^A-Za-z]/g, '').toUpperCase().split('').slice(0, 3) : []
  return (
    <div className={cx('stub farec', mode)}>
      <span className="sk2"><M.Icon />{mode === 'transit' ? 'Transit' : M.name}</span>
      <b>{fmtDuration(mins)}</b>
      <small>{legs.length ? `${legs.length} leg${legs.length === 1 ? '' : 's'} left` : 'No more travel today'}</small>
      {zones.length > 0 && <span className="zn">{zones.map((z) => <i key={z}>{z}</i>)}</span>}
    </div>
  )
}

/** The leg to the next plan, flagged if it's already time to go. */
function LateAwareLeg({ leg, now, onOpen }: { leg: Leg; now: number; onOpen: () => void }) {
  const trip = useStore((s) => s.trip)
  const leave = leaveAt(trip, leg)
  if (leave > now) return <LegPill trip={trip} leg={leg} onOpen={onOpen} />
  return <LegPill trip={trip} leg={{ ...leg, tight: true }} late={now - leave} onOpen={onOpen} />
}

function SimControl({ inTrip }: { inTrip: boolean }) {
  const trip = useStore((s) => s.trip)
  const simNow = useStore((s) => s.simNow)
  const setSimNow = useStore((s) => s.setSimNow)
  const now = useNow()
  const daysAway = Math.round((Date.parse(trip.startDay) - Date.parse(now.day)) / 86400000)
  const set = (day: string, min: number) => setSimNow(wallToUtc(trip.timezone, day, min))
  const picker = (
    <input
      type="datetime-local"
      value={`${now.day}T${toHHMM(now.min)}`}
      aria-label="Pretend it's this time"
      onChange={(e) => {
        const [d, t] = e.target.value.split('T')
        if (d && t) set(d, Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
      }}
    />
  )
  if (now.simulated) {
    return (
      <div className="sim">
        <span>Pretend</span>
        {picker}
        <button onClick={() => setSimNow((simNow ?? Date.now()) + 15 * 60000)}>+15m</button>
        <button onClick={() => setSimNow((simNow ?? Date.now()) + 60 * 60000)}>+1h</button>
        <button className="ml-auto" onClick={() => setSimNow(null)}>Real time</button>
      </div>
    )
  }
  if (inTrip) return null
  return (
    <div className="pn flex flex-col gap-2">
      <b className="text-[15px]">{daysAway > 0 ? `The trip starts in ${daysAway} day${daysAway === 1 ? '' : 's'}.` : 'The trip is over.'}</b>
      <p className="text-sm t-sub">This screen comes alive during the trip. Preview it by pretending it's a time on one of your days:</p>
      <div className="sim">
        <button onClick={() => set(trip.blocks.find((b) => b.locked)?.day ?? trip.startDay, 14 * 60)}>Try a game day, 2pm</button>
        {picker}
      </div>
    </div>
  )
}

function RunningLate({ day, now, initial, onClose }: { day: string; now: number; initial: number; onClose: () => void }) {
  const trip = useStore((s) => s.trip)
  const setBlocks = useStore((s) => s.setBlocks)
  const [delay, setDelay] = useState<number>(initial)
  const [done, setDone] = useState<string | null>(null)
  const result: LateResult | null = useMemo(() => (done ? null : runningLate(trip, day, now, delay)), [trip, day, now, delay, done])
  const title = (id: string) => itemById(trip, trip.blocks.find((b) => b.id === id)?.itemId ?? '')?.title ?? ''

  const apply = (blocks: Block[], dropped: string[], msg: string) => {
    setBlocks(applyDay(trip, day, blocks, dropped))
    setDone(msg)
  }

  return (
    <Sheet open onClose={onClose} title="Running late">
      <div className="flex items-center gap-2">
        <span className="label">How late?</span>
        <div className="seg ml-auto grid-cols-3" style={{ width: 180 }}>
          {[15, 30, 60].map((m) => (
            <button key={m} aria-pressed={delay === m} onClick={() => { setDelay(m); setDone(null) }}>+{m}</button>
          ))}
        </div>
      </div>
      {done && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm" style={{ color: '#15803d' }}>Done: {done}. Undo is at the top if you change your mind.</p>
          <button className="btn w-full" onClick={onClose}>Close</button>
        </div>
      )}
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
    </Sheet>
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
    <>
      <div className="sl"><span>Open nearby</span><span>{free < 600 ? `${fmtDuration(free)} free` : 'rest of the day free'}</span></div>
      <div className="pn np rows">
        {list.map(({ i, mode, travel, arrive, status, fits, dist }) => {
          const Glyph = glyphFor(i)
          const M = MODE_STYLE[mode].Icon
          return (
            <div key={i.id} className={cx('near', !fits && 'opacity-55')}>
              <Glyph />
              <span className="x">
                <b>{i.title}</b>
                <small className="flex items-center gap-1">
                  <M size={11} /> {travel} min · {fmtDistance(dist)}
                  {status === 'open' ? ` · ${hoursSummary(i.hours, day, clock)}` : ' · hours unknown'}
                  {!fits && ' · not enough time'}
                </small>
              </span>
              <Votes item={i} people={trip.people} />
              <button
                className="go"
                onClick={() => {
                  const s = Math.ceil(arrive / 5) * 5
                  addBlock({ itemId: i.id, day, start: s, end: s + Math.min(i.duration.typical, Math.max(i.duration.min, free - travel)), locked: false })
                }}
              >
                <Plus size={12} className="inline" /> Go
              </button>
            </div>
          )
        })}
        {!list.length && <div className="near t-sub">Nothing on your list is open nearby right now.</div>}
      </div>
    </>
  )
}
