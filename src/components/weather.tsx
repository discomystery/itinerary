import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, type LucideIcon, Snowflake, Sun } from 'lucide-react'
import { type DayWeather, type Sky, weatherLine } from '../lib/weather'

const SKY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
}

/** One line of weather for a day: icon, sky, high/low, chance of rain. */
export function Weather({ w }: { w?: DayWeather }) {
  if (!w) return null
  const Icon = SKY_ICON[w.sky]
  return (
    <span className="wx" title={w.typical ? 'Typical for these dates over the last five years. The forecast shows up about two weeks out.' : 'Forecast from Open-Meteo'}>
      <Icon aria-hidden="true" />
      {weatherLine(w)}
    </span>
  )
}
