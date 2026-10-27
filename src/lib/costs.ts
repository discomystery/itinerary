import type { Block, Item, Trip } from '../types'

// Planned spending: a price on any idea, totalled per day and for the trip.
// Each idea counts once, on the first day it's scheduled, so a hotel with a
// check-in and a check-out block isn't paid for twice.

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'MXN']

export const currencyOf = (t: Trip) => t.currency ?? 'USD'

export function fmtMoney(n: number, currency: string): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }).format(n)
  } catch {
    return `${n.toFixed(whole ? 0 : 2)} ${currency}`
  }
}

/** How many people a plan is for: its `who`, or everyone. */
const heads = (trip: Trip, b?: Block) => Math.max(1, b?.who?.length || trip.people.length)

/** What the whole group pays, and what each person pays. */
export function costOf(trip: Trip, item: Item, b?: Block): { total: number; each: number } | null {
  const c = item.cost
  if (!c || !(c.amount > 0)) return null
  const n = heads(trip, b)
  return c.per === 'person' ? { total: c.amount * n, each: c.amount } : { total: c.amount, each: c.amount / n }
}

export interface Totals {
  total: number
  each: number
}

export interface TripCosts extends Totals {
  byDay: Record<string, Totals>
  /** Priced ideas that aren't on the plan yet. */
  ideas: Totals & { count: number }
}

export function tripCosts(trip: Trip): TripCosts {
  const out: TripCosts = { total: 0, each: 0, byDay: {}, ideas: { total: 0, each: 0, count: 0 } }
  for (const item of trip.items) {
    if (item.inbox) continue
    const first = trip.blocks.filter((b) => b.itemId === item.id).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)[0]
    const c = costOf(trip, item, first)
    if (!c) continue
    if (!first) {
      out.ideas.total += c.total
      out.ideas.each += c.each
      out.ideas.count++
      continue
    }
    out.total += c.total
    out.each += c.each
    const d = (out.byDay[first.day] ??= { total: 0, each: 0 })
    d.total += c.total
    d.each += c.each
  }
  return out
}
