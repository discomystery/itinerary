import { Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardKind, det, fieldsFor, KINDS, ribbonsFor, variantOf } from '../lib/cards'
import { costOf, currencyOf, fmtMoney, tripCosts } from '../lib/costs'
import { daylight, hoursSummary } from '../lib/hours'
import { analyzeDay } from '../lib/schedule'
import { dayLabel, dayRange } from '../lib/time'
import { type DayWeather, weatherLine } from '../lib/weather'
import { MODE_STYLE } from './rail'
import { clock } from './objects'
import { Sheet } from './ui'
import type { Trip } from '../types'

// A plain, printable itinerary: what you'd fold into a pocket in case the
// phone dies. Rendered into <body> next to the app, and only shown in print.

/** Printer button for a view header: print this day or the whole trip. */
export function PrintButton({ trip, day, weather }: { trip: Trip; day: string; weather: Record<string, DayWeather> }) {
  const [asking, setAsking] = useState(false)
  const [days, setDays] = useState<string[] | null>(null)

  useEffect(() => {
    if (!days) return
    const done = () => setDays(null)
    window.addEventListener('afterprint', done)
    // Let the printout render before the dialog snapshots the page.
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [days])

  const go = (d: string[]) => {
    setAsking(false)
    setDays(d)
  }

  return (
    <>
      <button className="ib" onClick={() => setAsking(true)} aria-label="Print" title="Print"><Printer /></button>
      {asking && (
        <Sheet open onClose={() => setAsking(false)} title="Print">
          <div className="menu">
            <button onClick={() => go([day])}><Printer />This day ({dayLabel(day)})</button>
            <button onClick={() => go(dayRange(trip.startDay, trip.endDay))}><Printer />The whole trip</button>
          </div>
          <p className="mt-2 text-xs t-sub">Choose “Save as PDF” in the print dialog to keep a copy on your phone.</p>
        </Sheet>
      )}
      {days && createPortal(<Printout trip={trip} days={days} weather={weather} />, document.body)}
    </>
  )
}

export function Printout({ trip, days, weather }: { trip: Trip; days: string[]; weather: Record<string, DayWeather> }) {
  const cur = currencyOf(trip)
  const costs = tripCosts(trip)
  const shown = days.length > 1 ? days.filter((d) => trip.blocks.some((b) => b.day === d) || ribbonsFor(trip, d, clock).length) : days
  return (
    <div className="printout">
      <header>
        <h1>{trip.name}</h1>
        <p>
          {dayLabel(trip.startDay)} – {dayLabel(trip.endDay)} · times in {trip.timezone.split('/')[1]?.replace('_', ' ') ?? trip.timezone}
          {days.length > 1 && costs.total > 0 && ` · planned ${fmtMoney(costs.each, cur)} each`}
        </p>
      </header>
      {shown.map((day) => {
        const a = analyzeDay(trip, day)
        const legByTo = new Map(a.legs.map((l) => [l.toId, l]))
        const dl = daylight(day, trip.center.lat, trip.center.lng, trip.timezone)
        const spend = costs.byDay[day]
        const ribbons = ribbonsFor(trip, day, clock)
        return (
          <section key={day}>
            <h2>{dayLabel(day, 'long')}</h2>
            <p className="meta">
              {[
                weather[day] && weatherLine(weather[day]),
                dl && `Sunrise ${clock(dl.sunrise)} · sunset ${clock(dl.sunset)}`,
                spend && `${fmtMoney(spend.each, cur)} each`,
              ].filter(Boolean).join(' · ')}
            </p>
            {ribbons.length > 0 && <p className="meta">{ribbons.map((r) => `${r.item.title}: ${r.text}`).join(' · ')}</p>}
            {!a.blocks.length && <p className="empty">Nothing planned.</p>}
            <table>
              <tbody>
                {a.blocks.map((b) => {
                  const item = trip.items.find((i) => i.id === b.itemId)
                  if (!item) return null
                  const k = cardKind(item)
                  const leg = legByTo.get(b.id)
                  const fields = fieldsFor(k, variantOf(item))
                    .map((f) => [f.label, det(item, f.id)?.replace(/\n/g, ' → ')] as const)
                    .filter(([, v]) => v)
                  const hours = hoursSummary(item.hours, day, clock)
                  const cost = costOf(trip, item, b)
                  const issues = a.issues.get(b.id)?.filter((i) => i.severity !== 'info') ?? []
                  return (
                    <tr key={b.id}>
                      <td className="tm">
                        {clock(b.start)}–{clock(b.end)}
                        {leg && leg.minutes > 0 && <small>leave {clock(b.start - leg.minutes)}<br />{MODE_STYLE[leg.mode].name.toLowerCase()} {leg.minutes} min</small>}
                      </td>
                      <td>
                        <b>{item.title}</b>
                        <span className="kd">{KINDS[k].label}{b.locked && ' · fixed time'}</span>
                        {item.address && <div>{item.address}</div>}
                        {fields.length > 0 && <div>{fields.map(([l, v]) => `${l}: ${v}`).join(' · ')}</div>}
                        {(hours || cost) && <div className="sm">{[hours && `Open ${hours}`, cost && `${fmtMoney(cost.each, cur)} each`].filter(Boolean).join(' · ')}</div>}
                        {item.notes && <div className="sm nt">{item.notes}</div>}
                        {item.tbd && <div className="sm wn">Still needs: {item.tbd}</div>}
                        {issues.map((i, n) => <div key={n} className="sm wn">{i.message}</div>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
      <footer>Printed from Papermap · {new Date().toLocaleDateString()}</footer>
    </div>
  )
}
