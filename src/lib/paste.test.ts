import { describe, expect, it } from 'vitest'
import { parseLine, parseMapsUrl, parsePaste } from './paste'

describe('paste parsing', () => {
  it('splits a friend-style list into ideas with notes, tags and hints', () => {
    const got = parsePaste(`Must do in Helsinki:
- Löyly – sauna + jump in the sea, book ahead
- Café Regatta (cinnamon buns by the water)
* Kallio for bars #nightlife
1. Design Museum
2) Sat: Hietalahti flea market

Food:
Kappeli
Kappeli`)
    expect(got.map((g) => g.title)).toEqual(['Löyly', 'Café Regatta', 'Kallio for bars', 'Design Museum', 'Hietalahti flea market', 'Kappeli'])
    expect(got[0].notes).toBe('sauna + jump in the sea, book ahead')
    expect(got[0].tags).toContain('sauna')
    expect(got[0].tags).toContain('must-do-in-helsinki')
    expect(got[1].notes).toBe('cinnamon buns by the water')
    expect(got[1].tags).toContain('food')
    expect(got[2].tags).toContain('nightlife')
    expect(got[3].tags).toContain('museum')
    expect(got[4]).toMatchObject({ weekday: 6 })
    expect(got[4].tags).toContain('shopping')
    expect(got[5].tags).toContain('food')
  })

  it('reads weekdays and kinds', () => {
    expect(parseLine('Hockey game Saturday night')).toMatchObject({ type: 'event', weekday: 6 })
    expect(parseLine('Wander the Design District')).toMatchObject({ type: 'area' })
  })

  it('takes names and pins from Google Maps links', () => {
    const url = 'https://www.google.com/maps/place/L%C3%B6yly+Helsinki/@60.1524,24.9271,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d60.1525!4d24.9278'
    expect(parseMapsUrl(url)).toEqual({ name: 'Löyly Helsinki', location: { lat: 60.1525, lng: 24.9278 } })
    const p = parseLine(`- ${url}`)!
    expect(p.title).toBe('Löyly Helsinki')
    expect(p.location).toEqual({ lat: 60.1525, lng: 24.9278 })
    expect(parseMapsUrl('https://www.google.com/maps/search/?api=1&query=Oodi+Helsinki')).toEqual({ name: 'Oodi Helsinki' })
    expect(parseMapsUrl('https://example.com/maps/place/x')).toBeNull()
  })

  it('keeps a plain link with its text', () => {
    const p = parseLine('Allas Sea Pool https://allasseapool.fi/en/')!
    expect(p).toMatchObject({ title: 'Allas Sea Pool', url: 'https://allasseapool.fi/en/' })
  })
})
