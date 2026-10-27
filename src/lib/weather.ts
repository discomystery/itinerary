import { useEffect, useState } from 'react'
import type { LatLng, Trip } from '../types'
import { addDays, dayRange, nowIn } from './time'

// Daily weather from Open-Meteo (free, no key). Days inside the 16-day forecast
// window get the forecast; days further out get "typical": the same dates over
// the last five years.

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export interface DayWeather {
  sky: Sky
  /** °C */
  hi: number
  lo: number
  /** Chance of rain or snow, 0–100. */
  wet: number
  typical: boolean
}

const FORECAST_DAYS = 16
const YEARS = 5

/** WMO weather interpretation codes, as Open-Meteo returns them. */
export function skyOf(code: number): Sky {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain'
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storms',
}

/** °F for US English, °C everywhere else. */
export const prefersFahrenheit = () => typeof navigator !== 'undefined' && /^en-US/i.test(navigator.language)

export function fmtTemp(c: number, f = prefersFahrenheit()): string {
  return `${Math.round(f ? c * 1.8 + 32 : c)}°`
}

/** "Cloudy · 41°/34° · 40% rain", "Typically 38°/31°". */
export function weatherLine(w: DayWeather): string {
  const temps = `${fmtTemp(w.hi)}/${fmtTemp(w.lo)}`
  const wet = w.wet >= 20 ? ` · ${w.wet}% ${w.sky === 'snow' ? 'snow' : 'rain'}` : ''
  return w.typical ? `Typically ${temps}${wet}` : `${SKY_LABEL[w.sky]} · ${temps}${wet}`
}

interface Daily {
  time: string[]
  weather_code: (number | null)[]
  temperature_2m_max: (number | null)[]
  temperature_2m_min: (number | null)[]
  precipitation_probability_max?: (number | null)[]
  precipitation_sum?: (number | null)[]
}

const at = (p: LatLng) => `latitude=${p.lat.toFixed(3)}&longitude=${p.lng.toFixed(3)}`

async function daily(url: string): Promise<Daily> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`weather ${r.status}`)
  const j = await r.json()
  if (!j.daily?.time) throw new Error('weather: no daily data')
  return j.daily
}

export function parseForecast(d: Daily): Record<string, DayWeather> {
  const out: Record<string, DayWeather> = {}
  d.time.forEach((day, n) => {
    const hi = d.temperature_2m_max[n]
    const lo = d.temperature_2m_min[n]
    if (hi == null || lo == null) return
    out[day] = { sky: skyOf(d.weather_code[n] ?? 3), hi, lo, wet: Math.round(d.precipitation_probability_max?.[n] ?? 0), typical: false }
  })
  return out
}

/** Average the same calendar days over past years. `years[k]` covers `days` shifted back k+1 years. */
export function typicalFrom(days: string[], years: Daily[]): Record<string, DayWeather> {
  const out: Record<string, DayWeather> = {}
  days.forEach((day, n) => {
    const rows = years
      .map((y) => ({ code: y.weather_code[n], hi: y.temperature_2m_max[n], lo: y.temperature_2m_min[n], p: y.precipitation_sum?.[n] }))
      .filter((r) => r.hi != null && r.lo != null)
    if (!rows.length) return
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const wetDays = rows.filter((r) => (r.p ?? 0) >= 1).length
    const counts = new Map<Sky, number>()
    for (const r of rows) {
      const s = skyOf(r.code ?? 3)
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    const sky = [...counts].sort((a, b) => b[1] - a[1])[0][0]
    out[day] = { sky, hi: avg(rows.map((r) => r.hi!)), lo: avg(rows.map((r) => r.lo!)), wet: Math.round((wetDays / rows.length) * 100), typical: true }
  })
  return out
}

const shiftYears = (day: string, k: number) => {
  const y = Number(day.slice(0, 4)) - k
  // Feb 29 has no partner in most years.
  return day.slice(5) === '02-29' ? `${y}-02-28` : `${y}${day.slice(4)}`
}

export async function fetchWeather(trip: Trip, today: string): Promise<Record<string, DayWeather>> {
  const days = dayRange(trip.startDay, trip.endDay)
  if (!days.length || trip.endDay < today) return {}
  const lastForecast = addDays(today, FORECAST_DAYS - 1)
  const near = days.filter((d) => d >= today && d <= lastForecast)
  const far = days.filter((d) => d > lastForecast || d < today)
  const tz = encodeURIComponent(trip.timezone)
  const out: Record<string, DayWeather> = {}

  if (near.length) {
    const d = await daily(
      `https://api.open-meteo.com/v1/forecast?${at(trip.center)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${tz}&start_date=${near[0]}&end_date=${near.at(-1)}`,
    )
    Object.assign(out, parseForecast(d))
  }
  if (far.length) {
    // One request per year covering the far days' span; pick the far days back out.
    const span = dayRange(far[0], far.at(-1)!)
    const years = await Promise.all(
      Array.from({ length: YEARS }, (_, k) =>
        daily(
          `https://archive-api.open-meteo.com/v1/archive?${at(trip.center)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${tz}&start_date=${shiftYears(span[0], k + 1)}&end_date=${shiftYears(span.at(-1)!, k + 1)}`,
        ).catch(() => null),
      ),
    )
    const typical = typicalFrom(span, years.filter((y): y is Daily => !!y))
    for (const d of far) if (typical[d]) out[d] = typical[d]
  }
  return out
}

/* ------------------------------- Caching ------------------------------- */

const KEY = 'weather-v1'
const FRESH_MS = 3 * 3600_000

interface Cached {
  key: string
  at: number
  data: Record<string, DayWeather>
}

const cacheKey = (t: Trip, today: string) => `${at(t.center)}|${t.startDay}|${t.endDay}|${t.timezone}|${today}`

function readCache(): Cached | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Weather for each trip day it's known for; empty while loading or offline. */
export function useWeather(trip: Trip): Record<string, DayWeather> {
  const today = nowIn(trip.timezone).day
  const key = cacheKey(trip, today)
  const [data, setData] = useState<Record<string, DayWeather>>(() => {
    const c = readCache()
    return c?.key === key ? c.data : {}
  })
  useEffect(() => {
    const c = readCache()
    if (c?.key === key) {
      setData(c.data)
      if (Date.now() - c.at < FRESH_MS) return
    }
    let live = true
    fetchWeather(trip, today)
      .then((d) => {
        if (!live) return
        setData(d)
        try {
          localStorage.setItem(KEY, JSON.stringify({ key, at: Date.now(), data: d } satisfies Cached))
        } catch {
          /* private mode */
        }
      })
      .catch(() => {
        /* offline: keep whatever we had */
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return data
}
