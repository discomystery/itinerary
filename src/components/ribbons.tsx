import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { cardKind, ribbonsFor } from '../lib/cards'
import { useStore } from '../store'
import { clock, glyphFor, ObjectCard } from './objects'
import { cx } from './ui'

/** Stays, rentals and passes still running today, as slim strips. Tap one to unfold its card. */
export function Ribbons({ day }: { day: string }) {
  const trip = useStore((s) => s.trip)
  const edit = useStore((s) => s.edit)
  const [open, setOpen] = useState<string | null>(null)
  const list = ribbonsFor(trip, day, clock)
  if (!list.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {list.map(({ item, text, pips }) =>
        open === item.id ? (
          <ObjectCard
            key={item.id} item={item} day={day} tz={trip.timezone} open onClick={() => setOpen(null)} onEdit={() => edit(item.id)}
            strip={<><span /><button type="button" onClick={() => edit(item.id)}><Pencil />Edit</button></>}
          />
        ) : (
          <button key={item.id} type="button" className={cx('rib', cardKind(item))} onClick={() => setOpen(item.id)}>
            {(() => {
              const G = glyphFor(item)
              return <G />
            })()}
            <b>{item.title}</b>
            <span className="rt">{text}</span>
            {pips && (
              <span className="pips" aria-hidden="true">
                {Array.from({ length: Math.min(pips.total, 10) }, (_, n) => <i key={n} className={cx(n < pips.on && 'on')} />)}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
