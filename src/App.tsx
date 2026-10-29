import { CalendarDays, Lightbulb, type LucideIcon, Map as MapIcon, Timer, Undo2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx, Mark } from './components/ui'
import { DetailPane, picked, TopTabs, UndoButton, WhoAmI } from './components/hub'
import ItemEditor from './components/ItemEditor'
import { SampleNote } from './components/sample'
import { type Tab, useStore } from './store'
import { importFromHash } from './lib/share'
import { useInboxLookups } from './lib/useInboxLookups'
import { useLayout } from './lib/useLayout'
import BoardView from './views/BoardView'
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
  const { tab, setTab, trip, history: past, undo, editing, edit, selected } = useStore()
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const main = useRef<HTMLElement>(null)
  const layout = useLayout()
  useInboxLookups()
  // Each tab opens at its top.
  useEffect(() => {
    main.current?.scrollTo(0, 0)
  }, [tab, layout])

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

  const toast = shareMsg && (
    <button className="chrome px-3 py-2 text-left text-sm" style={{ color: '#15803d' }} onClick={() => setShareMsg(null)}>{shareMsg}</button>
  )

  if (layout !== 'phone') {
    // Plan is the board, with the picked card unfolded beside it (docked on desk, over the board on tablet).
    // Ideas sits beside a map of everything on desk.
    const aside = tab === 'plan' && picked(trip, selected)
      ? <section className={cx('pane aside detailp', layout === 'tablet' && 'over')} aria-label="Details"><div className="ab overflow-y-auto"><DetailPane /></div></section>
      : tab === 'ideas' && layout === 'desk'
        ? <section className="pane aside" aria-label="Map"><div className="ab overflow-hidden"><MapView embedded defaultShow="all" /></div></section>
        : null
    return (
      <div className={cx('hub', `l-${layout}`)}>
        <header className="topbar chrome">
          <div className="flex min-w-0 flex-1 items-center gap-3" title={trip.name}>
            <Mark />
            {layout === 'desk' && <b className="truncate text-[15px]">{trip.name}</b>}
          </div>
          <TopTabs tabs={TABS} />
          <div className="flex flex-1 items-center justify-end gap-2">
            <UndoButton />
            <WhoAmI />
          </div>
        </header>
        <SampleNote />
        <div className="panes">
          <main ref={main} className={cx('pane', tab === 'map' || tab === 'plan' ? 'overflow-hidden' : 'overflow-y-auto')}>
            {toast}
            {tab === 'now' && <NowView />}
            {tab === 'plan' && <BoardView />}
            {tab === 'map' && <MapView />}
            {tab === 'ideas' && <IdeasView />}
            {tab === 'trip' && <TripView />}
          </main>
          {aside}
        </div>
        {editing && <ItemEditor id={editing} onClose={() => edit(null)} />}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="chrome flex items-center gap-2 px-3.5 pb-1.5 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1" title={trip.name}><Mark /></div>
        {past.length > 0 && (
          <button className="btn-ghost h-8 px-2" onClick={undo} title="Undo" aria-label="Undo">
            <Undo2 size={17} />
          </button>
        )}
        <WhoAmI />
      </header>

      <SampleNote />
      {toast}

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
