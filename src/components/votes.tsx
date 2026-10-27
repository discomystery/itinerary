import { ClipboardCheck } from 'lucide-react'
import { type RefObject, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { Interest, Item } from '../types'
import { Avatar, cx, INTEREST_META, INTERESTS, InterestPicker, Sheet } from './ui'

/** All four votes laid out at once, over the bottom of a tile. One tap picks; tapping your vote again clears it. */
/** Taps on `toggle` (the button that opened it) are left to that button. */
export function VoteTray({ value, onPick, onClose, toggle }: {
  value?: Interest
  onPick: (v: Interest | null) => void
  onClose: () => void
  toggle?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !toggle?.current?.contains(t)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose, toggle])
  return (
    <div ref={ref} className="vtray" role="group" aria-label="Your vote" onClick={(e) => e.stopPropagation()}>
      {INTERESTS.map((k) => {
        const { Icon, label, color } = INTEREST_META[k]
        const on = value === k
        return (
          <button
            key={k}
            aria-pressed={on}
            style={{ '--vc': color } as React.CSSProperties}
            onClick={() => {
              onPick(on ? null : k)
              onClose()
            }}
          >
            <i><Icon fill={on && k === 'must' ? 'currentColor' : 'none'} /></i>
            <span>{label === 'Interested' ? 'Yes' : label === 'Must do' ? 'Must' : label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Organizer: everyone's vote on one idea, one tap each. */
export function VotesSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const people = useStore((s) => s.trip.people)
  const live = useStore((s) => s.trip.items.find((i) => i.id === item.id)) ?? item
  const { setInterest, setInterestAll } = useStore()
  const all = people.map((p) => live.interest[p.id])
  const same = all.every((v) => v && v === all[0]) ? all[0] : undefined
  return (
    <Sheet open onClose={onClose} title={live.title} footer={<button className="btn w-full" onClick={onClose}>Done</button>}>
      <p className="mb-3 flex items-center gap-1.5 text-xs t-sub"><ClipboardCheck size={14} /> Organizer: setting votes for the group</p>
      <ul className="votegrid">
        <li className="everyone">
          <span className="x"><b>Everyone</b><small>Sets all {people.length}</small></span>
          <InterestPicker value={same} onChange={(v) => setInterestAll(live.id, v)} />
        </li>
        {people.map((p) => {
          const v = live.interest[p.id]
          return (
            <li key={p.id}>
              <Avatar person={p} size={28} />
              <span className="x"><b>{p.name}</b><small className={cx(!v && 'todo')}>{v ? INTEREST_META[v].label : 'No vote yet'}</small></span>
              <InterestPicker value={v} onChange={(nv) => setInterest(live.id, p.id, nv)} />
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
