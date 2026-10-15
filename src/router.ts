import { useSyncExternalStore } from 'react'
import type { Kind } from './types'

export type Route =
  /** The two tracks: maps (with their letters) and the coin's letters. */
  | { name: 'list' } | { name: 'coins' }
  | { name: 'settings' } | { name: 'import' } | { name: 'clients' } | { name: 'labels' }
  /** from: a piece whose client data the new one starts with (its track comes along). */
  | { name: 'new'; kind: Kind; from?: string }
  | { name: 'client'; id: string }

function parse(hash: string): Route {
  const m = hash.match(/^#\/client\/([\w-]+)/)
  if (m) return { name: 'client', id: m[1] }
  if (hash.startsWith('#/settings')) return { name: 'settings' }
  // #/new, #/new/coin, #/new/from/:id, #/new/coin/from/:id
  const n = hash.match(/^#\/new(\/coin)?(?:\/from\/([\w-]+))?/)
  if (n) return { name: 'new', kind: n[1] ? 'coin' : 'map', from: n[2] }
  if (hash.startsWith('#/moedas')) return { name: 'coins' }
  if (hash.startsWith('#/clients')) return { name: 'clients' }
  if (hash.startsWith('#/import')) return { name: 'import' }
  if (hash.startsWith('#/labels')) return { name: 'labels' }
  return { name: 'list' }
}

const subscribe = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}

export const useHash = () => useSyncExternalStore(subscribe, () => location.hash)
export const useRoute = () => parse(useHash())
// A page with unsaved work can hold navigation: the guard asks, and false keeps you there.
let guard: (() => boolean) | null = null
export const setLeaveGuard = (g: (() => boolean) | null) => {
  guard = g
}
const mayLeave = () => !guard || guard()

// Links change the hash before anyone can ask, so catch the click first.
document.addEventListener(
  'click',
  (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]')
    if (a && a.getAttribute('href') !== location.hash && !mayLeave()) e.preventDefault()
  },
  true,
)

/** force: leave without asking (the page already handled its unsaved work). */
export const navigate = (hash: string, opts: { force?: boolean } = {}) => {
  if (!opts.force && hash !== location.hash && !mayLeave()) return
  location.hash = hash
  window.scrollTo({ top: 0 })
}
