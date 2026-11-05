import { Undo2 } from 'lucide-react'
import { type PointerEvent as RPointerEvent, useEffect } from 'react'
import { create } from 'zustand'
import { clock } from './objects'
import { insertAt, moveBlock, type Moving } from '../lib/move'
import { anchoredSlot, findSlot, makeCtx } from '../lib/schedule'
import { dayLabel, snap } from '../lib/time'
import { useStore } from '../store'
import type { Id, Trip } from '../types'

// Picking up a card and putting it somewhere else, with a mouse, a pen or a
// finger. Pointer events rather than the browser's drag and drop, so it works
// the same on an iPad as on a desk: a mouse drags as soon as it moves, a finger
// holds for a moment first so the page still scrolls under a quick swipe.
//
// Drop targets are marked in the DOM, so any screen can take part:
//   data-drop="list" data-day   a day's list of cards; cards inside carry data-slot={blockId}
//   data-drop="grid" data-day data-t0 data-px   a time grid (minutes at the top, pixels per minute)
//   data-drop="day"  data-day   somewhere that just means a day (a day pill, a free day)
//   data-drop="ideas"           the ideas pool: unplans it

export type DragPayload = { kind: 'block'; id: Id } | { kind: 'idea'; id: Id }

export type DropTarget =
  | { kind: 'list'; day: string; prev?: Id; next?: Id; same: boolean }
  | { kind: 'grid'; day: string; start: number }
  | { kind: 'day'; day: string }
  | { kind: 'ideas' }

interface DragState {
  payload: DragPayload | null
  target: DropTarget | null
  /** After a drop: what happened, and whether Undo takes it back. */
  note: { text: string; undo: boolean } | null
}

export const useDrag = create<DragState>(() => ({ payload: null, target: null, note: null }))

const HOLD = 320 // ms a finger rests before the card lifts
const SLOP = 8 // px a finger can wander while holding
const MOUSE = 5 // px a mouse moves before it counts as a drag
const EDGE = 56 // px from a scroller's edge where it starts scrolling

function movingOf(trip: Trip, p: DragPayload): Moving | null {
  if (p.kind === 'block') {
    const block = trip.blocks.find((b) => b.id === p.id)
    const item = block && trip.items.find((i) => i.id === block.itemId)
    return block && item ? { block, item } : null
  }
  const item = trip.items.find((i) => i.id === p.id)
  return item ? { item } : null
}

/* ----------------------------- Hit testing ----------------------------- */

function hitTest(x: number, y: number, p: DragPayload, grabDy: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  if (!el) return null
  const day = el.dataset.day ?? ''
  switch (el.dataset.drop) {
    case 'ideas':
      return p.kind === 'block' ? { kind: 'ideas' } : null
    case 'day':
      return { kind: 'day', day }
    case 'grid': {
      const r = el.getBoundingClientRect()
      const px = Number(el.dataset.px)
      return { kind: 'grid', day, start: snap((y - grabDy - r.top) / px + Number(el.dataset.t0)) }
    }
    case 'list': {
      const slots = [...el.querySelectorAll<HTMLElement>('[data-slot]')]
      const self = slots.findIndex((s) => s.dataset.slot === p.id)
      const others = slots.filter((s) => s.dataset.slot !== p.id)
      const i = others.filter((s) => {
        const r = s.getBoundingClientRect()
        return r.top + r.height / 2 < y
      }).length
      return { kind: 'list', day, prev: others[i - 1]?.dataset.slot, next: others[i]?.dataset.slot, same: p.kind === 'block' && self >= 0 && self === i }
    }
  }
  return null
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => JSON.stringify(a) === JSON.stringify(b)

/** Scroll whatever scrolls under the pointer when it's near that scroller's edge. Returns whether it scrolled. */
function edgeScroll(x: number, y: number): boolean {
  let el = document.elementFromPoint(x, y) as HTMLElement | null
  let did = false
  let doneX = false
  let doneY = false
  for (; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (!doneY && /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
      const v = y < r.top + EDGE ? -(r.top + EDGE - y) : y > r.bottom - EDGE ? y - (r.bottom - EDGE) : 0
      if (v) {
        const before = el.scrollTop
        el.scrollTop += Math.round(v / 3)
        if (el.scrollTop !== before) did = doneY = true
      }
    }
    if (!doneX && /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth) {
      const v = x < r.left + EDGE ? -(r.left + EDGE - x) : x > r.right - EDGE ? x - (r.right - EDGE) : 0
      if (v) {
        const before = el.scrollLeft
        el.scrollLeft += Math.round(v / 3)
        if (el.scrollLeft !== before) did = doneX = true
      }
    }
  }
  return did
}

/* -------------------------------- Drop -------------------------------- */

function commit(p: DragPayload, t: DropTarget) {
  const s = useStore.getState()
  const trip = s.trip
  const m = movingOf(trip, p)
  if (!m) return
  let id: Id | null = m.block?.id ?? null
  let next = trip
  if (t.kind === 'ideas') {
    if (!m.block) return
    s.removeBlock(m.block.id)
    say(`${m.item.title} is back in Ideas`)
    return
  }
  if (t.kind === 'list') {
    if (t.same) return
    const r = insertAt(trip, makeCtx(trip), m, t.day, t.prev, t.next)
    next = r.trip
    id = r.blockId
  } else if (m.block) {
    next = moveBlock(trip, m.block.id, t.day, t.kind === 'grid' ? t.start : m.block.start)
  } else {
    // An idea dropped on a day or a time.
    const fixed = anchoredSlot(m.item, trip.timezone)
    if (fixed && fixed.day !== t.day) return say(`${m.item.title} is set for ${dayLabel(fixed.day)}`, false)
    const len = m.item.duration.typical || 60
    const slot = fixed ?? (t.kind === 'grid' ? { start: t.start, end: t.start + len } : findSlot(trip, t.day, m.item))
    if (!slot) return say(`No free time on ${dayLabel(t.day)} for ${m.item.title}`, false)
    id = s.addBlock({ itemId: m.item.id, day: t.day, start: slot.start, end: slot.end, locked: m.item.anchors.some((a) => a.hard) })
    s.select(id)
    say(`${m.item.title} added to ${dayLabel(t.day)}, ${clock(slot.start)}`)
    return
  }
  if (next === trip || !id) {
    if (!m.block && m.item.anchors.length) say(`${m.item.title} is set for ${dayLabel(anchoredSlot(m.item, trip.timezone)?.day ?? t.day)}`, false)
    return
  }
  s.mutate(() => next)
  const b = next.blocks.find((x) => x.id === id)!
  s.select(id)
  if (t.kind !== 'day') s.setDay(b.day)
  const shuffled = next.blocks.filter((x) => x.id !== id && x.day === b.day && trip.blocks.find((o) => o.id === x.id)?.start !== x.start).length
  say(`${m.item.title} ${m.block ? 'moved to' : 'added to'} ${dayLabel(b.day)}, ${clock(b.start)}${shuffled ? ` · ${shuffled} later plan${shuffled > 1 ? 's' : ''} shifted` : ''}`)
}

let noteTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string, undo = true) {
  clearTimeout(noteTimer)
  useDrag.setState({ note: { text, undo } })
  noteTimer = setTimeout(() => useDrag.setState({ note: null }), 5000)
}

/* ------------------------------ Dragging ------------------------------ */

let active: (() => void) | null = null

/**
 * Pointer-down handler that makes an element draggable. `handle` is for a grip
 * that's only for dragging: a finger drags it straight away, no hold.
 */
export function startDrag(e: RPointerEvent<HTMLElement>, payload: DragPayload, opts: { handle?: boolean } = {}) {
  if (e.button !== 0 || active) return
  if ((e.target as HTMLElement).closest('a, input, textarea, select, [data-nodrag]')) return
  const src = e.currentTarget
  const pid = e.pointerId
  const touch = e.pointerType !== 'mouse'
  const x0 = e.clientX
  const y0 = e.clientY
  let x = x0
  let y = y0
  let lifted = false
  let ghost: HTMLElement | null = null
  let grab = { dx: 0, dy: 0 }
  // Under a finger the card rides just above it, so the finger doesn't hide where it lands.
  let liftDy = 0
  let raf = 0
  if (opts.handle) {
    e.preventDefault()
    e.stopPropagation()
  }

  const lift = () => {
    lifted = true
    clearTimeout(hold)
    // The card itself lifts, so take its whole box, not just the grip's.
    const card = src.closest<HTMLElement>('[data-slot], [data-card]') ?? src
    const r = card.getBoundingClientRect()
    grab = { dx: x - r.left, dy: y - r.top }
    liftDy = touch ? Math.min(r.height, 120) + 14 : grab.dy
    ghost = card.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-slot')
    ghost.removeAttribute('data-card')
    ghost.classList.add('drag-ghost')
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: '0', top: '0', right: 'auto', bottom: 'auto' })
    ;(document.getElementById('root') ?? document.body).appendChild(ghost)
    document.documentElement.classList.add('is-dragging')
    if (touch) navigator.vibrate?.(8)
    useDrag.setState({ payload, target: null })
    place()
  }
  const place = () => {
    if (!ghost) return
    const t = hitTest(x, y, payload, grab.dy)
    if (!sameTarget(t, useDrag.getState().target)) useDrag.setState({ target: t })
    ghost.style.transform = `translate(${x - grab.dx}px, ${y - liftDy}px) rotate(-1.5deg)`
    // On a time grid the plan itself shows where it lands.
    ghost.style.opacity = t?.kind === 'grid' ? '0' : ''
  }
  const tick = () => {
    if (edgeScroll(x, y)) place()
    raf = requestAnimationFrame(tick)
  }

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return
    x = ev.clientX
    y = ev.clientY
    if (!lifted) {
      const d = Math.hypot(x - x0, y - y0)
      if (touch && !opts.handle) {
        if (d > SLOP) done()
        return
      }
      if (d < (touch ? 3 : MOUSE)) return
      lift()
      raf = requestAnimationFrame(tick)
      return
    }
    place()
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return
    const { target } = useDrag.getState()
    const was = lifted
    done()
    if (!was) return
    // The release isn't also a tap on whatever's underneath.
    const eat = (c: MouseEvent) => {
      c.stopPropagation()
      c.preventDefault()
    }
    window.addEventListener('click', eat, true)
    setTimeout(() => window.removeEventListener('click', eat, true), 0)
    if (target) commit(payload, target)
  }
  const onCancel = (ev: PointerEvent) => ev.pointerId === pid && done()
  const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && done()
  // Once a finger has lifted a card, the page mustn't scroll under it.
  const onTouchMove = (ev: TouchEvent) => lifted && ev.cancelable && ev.preventDefault()
  const onMenu = (ev: Event) => ev.preventDefault()

  const hold = touch && !opts.handle ? setTimeout(() => { lift(); raf = requestAnimationFrame(tick) }, HOLD) : undefined
  const done = () => {
    clearTimeout(hold)
    cancelAnimationFrame(raf)
    ghost?.remove()
    document.documentElement.classList.remove('is-dragging')
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('contextmenu', onMenu)
    if (lifted) useDrag.setState({ payload: null, target: null })
    active = null
  }
  active = done
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('contextmenu', onMenu)
}

/** Props that make an element draggable, or nothing when it can't move. */
export function dragProps(payload: DragPayload | null) {
  if (!payload) return {}
  return {
    'data-drag': '',
    onPointerDown: (e: RPointerEvent<HTMLElement>) => startDrag(e, payload),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  }
}

/** What's being dragged, and where it would land, for screens that show it. */
export function useDragging() {
  const payload = useDrag((s) => s.payload)
  const target = useDrag((s) => s.target)
  return { payload, target }
}

/** Where a drop would put the plan, for the line that marks it in a list. */
export function previewInsert(t: Extract<DropTarget, { kind: 'list' }>, p: DragPayload): { start: number } | { blocked: string } | null {
  const trip = useStore.getState().trip
  const m = movingOf(trip, p)
  if (!m) return null
  const r = insertAt(trip, makeCtx(trip), m, t.day, t.prev, t.next)
  if (!r.blockId) {
    const fixed = anchoredSlot(m.item, trip.timezone)
    return { blocked: fixed ? `Only on ${dayLabel(fixed.day)}` : 'Has a set time' }
  }
  return { start: r.trip.blocks.find((b) => b.id === r.blockId)!.start }
}

/** The note after a drop, with an undo. Mounted once, by the app. */
export function DropNote() {
  const note = useDrag((s) => s.note)
  const undo = useStore((s) => s.undo)
  useEffect(() => () => clearTimeout(noteTimer), [])
  if (!note) return null
  return (
    <div className="dropnote chrome" role="status">
      <span>{note.text}</span>
      {note.undo && (
        <button
          onClick={() => {
            undo()
            useDrag.setState({ note: null })
          }}
        >
          <Undo2 />Undo
        </button>
      )}
    </div>
  )
}
