import { Undo2, X } from 'lucide-react'
import { SAMPLE_ID, useStore } from '../store'

/** A note pinned over the sample trip: start your own, or keep looking around. After clearing, it offers undo. */
export function SampleNote() {
  const isSample = useStore((s) => s.trip.id === SAMPLE_ID)
  const dismissed = useStore((s) => s.sampleDismissed)
  const cleared = useStore((s) => s.cleared)
  const { startFresh, dismissSample, undo, setCleared } = useStore()

  if (cleared) {
    return (
      <div className="sample done" role="status">
        <span className="x"><b>Sample cleared.</b> This is your trip now. Name it and set the dates in Trip.</span>
        <button className="sw" onClick={undo}><Undo2 />Undo</button>
        <button className="cl" onClick={() => setCleared(false)} aria-label="Close"><X /></button>
      </div>
    )
  }
  if (!isSample || dismissed) return null
  return (
    <div className="sample" role="note">
      <span className="smark" aria-hidden="true">Sample</span>
      <span className="x"><b>This is a sample trip.</b> Look around, then clear it out and start your own.</span>
      <button className="go" onClick={startFresh}>Start my own trip</button>
      <button className="cl" onClick={dismissSample} aria-label="Keep the sample for now"><X /></button>
    </div>
  )
}
