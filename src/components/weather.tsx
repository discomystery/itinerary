import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, type LucideIcon, Snowflake, Sun } from 'lucide-react'
import { type DayWeather, fmtTemp, SKY_LABEL, type Sky, weatherLine } from '../lib/weather'

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

/** One line of weather for a day: icon, sky, high/low, chance of rain. Compact is the icon and high/low. */
export function Weather({ w, compact }: { w?: DayWeather; compact?: boolean }) {
  if (!w) return null
  const Icon = SKY_ICON[w.sky]
  const about = w.typical ? 'Typical for these dates over the last five years. The forecast shows up about two weeks out.' : 'Forecast from Open-Meteo'
  return (
    <span className="wx" title={compact ? `${weatherLine(w)}. ${about}` : about}>
      <Icon aria-label={compact ? SKY_LABEL[w.sky] : undefined} aria-hidden={compact ? undefined : true} />
      {compact ? `${fmtTemp(w.hi)}/${fmtTemp(w.lo)}` : weatherLine(w)}
    </span>
  )
}
