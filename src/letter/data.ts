import { kindOf, type Client } from '../types'
import { toMapData } from '../store'
import { processLogo } from '../map/logo'
import { letterText } from './copy'
import { LETTER_SPECS, type LetterData } from './render'

const logoCache = new Map<string, Promise<HTMLCanvasElement | null>>()

/** The client's logo in the letter's ink, as on the map (null when hidden or missing). */
export function letterLogo(c: Client): Promise<HTMLCanvasElement | null> {
  if (!c.logo) return Promise.resolve(null)
  const ink = LETTER_SPECS[c.style].ink
  const key = `${c.logoMode}:${ink}:${c.logo.length}:${c.logo.slice(-64)}`
  if (!logoCache.has(key)) logoCache.set(key, processLogo(c.logo, c.logoMode, ink))
  return logoCache.get(key)!
}

/** Everything the letter needs: track, company, logo, goal (the map's X, the client's goal on a coin) and the QR. */
export function toLetterData(c: Client, logo: HTMLCanvasElement | null): LetterData {
  const m = toMapData(c)
  // {goal} reads after "O caminho até" / "The path to", so it takes the same wording as the map's
  // subtitle: the default goal is an imperative ("Transforme…") that would not read there.
  return { kind: kindOf(c), lang: c.lang, logo, text: letterText(kindOf(c), c.lang, c.letter), company: c.company, goal: m.pathTo || c.destination, qrUrl: m.qrUrl }
}
