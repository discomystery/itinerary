import { CalendarDays, Lightbulb, type LucideIcon, Map as MapIcon, Timer, Undo2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, cx, Mark } from './components/ui'
import ItemEditor from './components/ItemEditor'
import { type Tab, useStore } from './store'
import { importFromHash } from './lib/share'
import { useInboxLookups } from './lib/useInboxLookups'
import IdeasView from './views/IdeasView'
import MapView from './views/MapView'
import NowView from './views/NowView'
import PlanView from './views/PlanView'
import TripView from './views/TripView'

const TABS: { id: Tab; Icon: LucideIcon; label: string }[] = [
  { id: 'now', Icon: Timer, label: 'Now' },
  { id: 'plan', Icon: CalendarDays, label: 'Plan' },
  { id: 'map', Icon: MapIcon, label: 'Map' },
  { id: 'ideas', Icon: Lightbulb, label: 'Ideas' },
  { id: 'trip', Icon: Users, label: 'Trip' },
]

export default function App() {
  const { tab, setTab, trip, viewer, setViewer, history: past, undo, editing, edit } = useStore()
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const main = useRef<HTMLElement>(null)
  useInboxLookups()
  // Each tab opens at its top.
  useEffect(() => {
    main.current?.scrollTo(0, 0)
  }, [tab])

  useEffect(() => {
    importFromHash().then((t) => {
      if (!t) return
      if (confirm(`Load shared trip "${t.name}"? This replaces the trip on this device (you can undo).`)) {
        useStore.getState().replaceTrip(t)
        setShareMsg('Shared trip loaded')
      }
      window.history.replaceState(null, '', location.pathname)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const me = trip.people.find((p) => p.id === viewer) ?? trip.people[0]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="chrome flex items-center gap-2 px-3.5 pb-1.5 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1" title={trip.name}><Mark /></div>
        {past.length > 0 && (
          <button className="btn-ghost h-8 px-2" onClick={undo} title="Undo" aria-label="Undo">
            <Undo2 size={17} />
          </button>
        )}
        {me && (
          <label className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs" title="Votes are cast as this person">
            <Avatar person={me} size={22} />
            <select className="bg-transparent font-semibold outline-none" value={me.id} onChange={(e) => setViewer(e.target.value)} aria-label="Voting as">
              {trip.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      {shareMsg && (
        <button className="chrome px-3 py-2 text-left text-sm" style={{ color: '#15803d' }} onClick={() => setShareMsg(null)}>{shareMsg}</button>
      )}

      <main ref={main} className={cx('min-h-0 flex-1', tab === 'map' ? 'overflow-hidden' : 'overflow-y-auto')}>
        {tab === 'now' && <NowView />}
        {tab === 'plan' && <PlanView />}
        {tab === 'map' && <MapView />}
        {tab === 'ideas' && <IdeasView />}
        {tab === 'trip' && <TripView />}
      </main>

      <nav className="chrome grid grid-cols-5 border-t b-line pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className="flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium"
            style={{ color: tab === t.id ? 'var(--act)' : 'var(--sub)' }}
          >
            <t.Icon size={22} strokeWidth={tab === t.id ? 2.2 : 1.8} />
            {t.label}
          </button>
        ))}
      </nav>

      {editing && <ItemEditor id={editing} onClose={() => edit(null)} />}
    </div>
  )
}
