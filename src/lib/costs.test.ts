import { describe, expect, it } from 'vitest'
import { helsinkiTrip } from '../data/helsinki'
import type { Trip } from '../types'
import { tripCosts } from './costs'

describe('costs', () => {
  const priced = (): Trip => {
    const t = helsinkiTrip()
    const set = (id: string, amount: number, per: 'person' | 'group') => {
      t.items.find((i) => i.id === id)!.cost = { amount, per }
    }
    set('i-game1', 90, 'person') // Thu, both of us
    set('i-suomenlinna', 20, 'group') // Fri, split two ways
    t.blocks.push({ id: 'b-again', itemId: 'i-game1', day: '2026-11-15', start: 600, end: 700, locked: false })
    return t
  }

  it('adds up each plan once, on its first day', () => {
    const c = tripCosts(priced())
    expect(c.total).toBe(200)
    expect(c.each).toBe(100)
    expect(c.byDay['2026-11-12']).toEqual({ total: 180, each: 90 })
    expect(c.byDay['2026-11-13']).toEqual({ total: 20, each: 10 })
    expect(c.byDay['2026-11-15']).toBeUndefined()
  })

  it('splits by who is on the plan, and keeps unscheduled ideas apart', () => {
    const t = priced()
    t.blocks.find((b) => b.id === 'b-5')!.who = ['p-me']
    const unplanned = t.items.find((i) => !t.blocks.some((b) => b.itemId === i.id) && !i.inbox)!
    unplanned.cost = { amount: 30, per: 'person' }
    const c = tripCosts(t)
    expect(c.byDay['2026-11-13']).toEqual({ total: 20, each: 20 })
    expect(c.ideas).toEqual({ total: 60, each: 30, count: 1 })
  })
})
