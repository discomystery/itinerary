import { useSyncExternalStore } from 'react'

/**
 * phone: the bottom-tab phone app (also phones in landscape, which are short).
 * tablet: iPad portrait, iPad mini (744 wide) included. Top tab bar, plan beside a map.
 * desk: desktop and iPad landscape, iPad mini (1133 wide) included. The three-pane planning hub.
 */
export type Layout = 'phone' | 'tablet' | 'desk'

const TABLET = '(min-width: 740px) and (min-height: 560px)'
const DESK = '(min-width: 1024px) and (min-height: 560px)'

function read(): Layout {
  if (typeof matchMedia === 'undefined') return 'phone'
  return matchMedia(DESK).matches ? 'desk' : matchMedia(TABLET).matches ? 'tablet' : 'phone'
}

function subscribe(cb: () => void) {
  const qs = [matchMedia(TABLET), matchMedia(DESK)]
  qs.forEach((q) => q.addEventListener('change', cb))
  return () => qs.forEach((q) => q.removeEventListener('change', cb))
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, read, () => 'phone')
}
