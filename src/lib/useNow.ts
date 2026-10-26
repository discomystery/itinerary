import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { nowIn } from './time'

/** Current wall time in the trip timezone (or the simulated "pretend it's" time). */
export function useNow(): { day: string; min: number; simulated: boolean } {
  const tz = useStore((s) => s.trip.timezone)
  const simNow = useStore((s) => s.simNow)
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const at = simNow ?? tick
  return { ...nowIn(tz, new Date(at)), simulated: simNow != null }
}
