import { useEffect, useState } from 'react'
import { Avatar, cx } from './components/ui'
import ItemEditor from './components/ItemEditor'
import { type Tab, useStore } from './store'
import { importFromHash } from './lib/share'
import IdeasView from './views/IdeasView'
import MapView from './views/MapView'
import NowView from './views/NowView'
import PlanView from './views/PlanView'
import TripView from './views/TripView'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'now', icon: '⏱️', label: 'Now' },
  { id: 'plan', icon: '🗓️', label: 'Plan' },
  { id: 'map', icon: '🗺️', label: 'Map' },
  { id: 'ideas', icon: '💡', label: 'Ideas' },
  { id: 'trip', icon: '👥', label: 'Trip' },
]

export default function App() {
  const { tab, setTab, trip, viewer, setViewer, history: past, undo, editing, edit } = useStore()
  const [shareMsg, setShareMsg] = useState<string | null>(null)

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
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{trip.name}</div>
        </div>
        <button className="btn-ghost px-2" disabled={!past.length} onClick={undo} title="Undo">
          ↶ <span className="hidden sm:inline">Undo</span>
        </button>
        {me && (
          <label className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2 text-xs" title="Votes are cast as this person">
            <Avatar person={me} size={22} />
            <span className="hidden text-slate-500 sm:inline">as</span>
            <select className="bg-transparent font-medium outline-none" value={me.id} onChange={(e) => setViewer(e.target.value)}>
              {trip.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      {shareMsg && (
        <div className="bg-emerald-50 px-3 py-2 text-sm text-emerald-800" onClick={() => setShareMsg(null)}>{shareMsg}</div>
      )}

      <main className={cx('min-h-0 flex-1', tab === 'map' ? 'overflow-hidden' : 'overflow-y-auto')}>
        {tab === 'now' && <NowView />}
        {tab === 'plan' && <PlanView />}
        {tab === 'map' && <MapView />}
        {tab === 'ideas' && <IdeasView />}
        {tab === 'trip' && <TripView />}
      </main>

      <nav className="grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px]', tab === t.id ? 'font-semibold text-slate-900' : 'text-slate-500')}
          >
            <span className={cx('text-lg leading-none', tab !== t.id && 'opacity-60 grayscale')}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {editing && <ItemEditor id={editing} onClose={() => edit(null)} />}
    </div>
  )
}
