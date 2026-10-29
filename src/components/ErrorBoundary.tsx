import { Component, type ReactNode } from 'react'
import { useStore } from '../store'

// One screen hitting bad data shouldn't blank the whole app: the tabs and
// undo stay up, and the broken part offers a way back.

interface Props {
  /** Change this (the tab, the open card) to clear the error and try again. */
  resetKey?: unknown
  children: ReactNode
}

export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[itinerary] a view crashed', error)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <Fallback error={this.state.error} retry={() => this.setState({ error: null })} />
  }
}

function Fallback({ error, retry }: { error: Error; retry: () => void }) {
  const canUndo = useStore((s) => s.history.length > 0)
  const undo = useStore((s) => s.undo)
  return (
    <div role="alert" className="mx-auto max-w-sm space-y-3 p-6 text-center">
      <b className="block text-[15px]">This screen hit a snag</b>
      <p className="text-sm t-sub">Your trip is still saved. {canUndo ? 'Undoing the last change usually fixes it.' : 'Try again, or switch tabs.'}</p>
      <div className="flex justify-center gap-2">
        {canUndo && <button className="btn" onClick={() => { undo(); retry() }}>Undo last change</button>}
        <button className={canUndo ? 'btn-ghost' : 'btn'} onClick={retry}>Try again</button>
      </div>
      <p className="text-xs t-sub">{error.message}</p>
    </div>
  )
}
