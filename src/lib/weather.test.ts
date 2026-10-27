import { describe, expect, it } from 'vitest'
import { fmtTemp, parseForecast, skyOf, typicalFrom, weatherLine } from './weather'

describe('weather', () => {
  it('maps WMO codes to skies', () => {
    expect(skyOf(0)).toBe('clear')
    expect(skyOf(3)).toBe('cloudy')
    expect(skyOf(61)).toBe('rain')
    expect(skyOf(73)).toBe('snow')
    expect(skyOf(95)).toBe('storm')
  })

  it('reads a forecast', () => {
    const w = parseForecast({ time: ['2026-11-10'], weather_code: [61], temperature_2m_max: [4.4], temperature_2m_min: [1], precipitation_probability_max: [70] })
    expect(w['2026-11-10']).toEqual({ sky: 'rain', hi: 4.4, lo: 1, wet: 70, typical: false })
  })

  it('averages past years into typical weather', () => {
    const year = (hi: number, p: number, code: number) => ({ time: ['x'], weather_code: [code], temperature_2m_max: [hi], temperature_2m_min: [hi - 4], precipitation_sum: [p] })
    const w = typicalFrom(['2026-11-14'], [year(2, 0, 3), year(4, 3, 61), year(6, 5, 3), year(4, 0, 3)])['2026-11-14']
    expect(w.hi).toBe(4)
    expect(w.lo).toBe(0)
    expect(w.wet).toBe(50)
    expect(w.sky).toBe('cloudy')
    expect(w.typical).toBe(true)
  })

  it('prints a line', () => {
    expect(fmtTemp(5, true)).toBe('41°')
    expect(fmtTemp(5, false)).toBe('5°')
    expect(weatherLine({ sky: 'clear', hi: 5, lo: 1, wet: 10, typical: false })).toMatch(/^Clear · \d+°\/\d+°$/)
    expect(weatherLine({ sky: 'rain', hi: 5, lo: 1, wet: 60, typical: true })).toMatch(/^Typically .* · 60% rain$/)
  })
})
