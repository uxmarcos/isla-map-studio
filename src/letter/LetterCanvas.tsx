import { useEffect, useRef, useState } from 'react'
import type { Client } from '../types'
import { kindOf } from '../types'
import { useSettings } from '../store'
import { drawLetter, LETTER_H, LETTER_W, letterSpec, loadLetterFonts, loadPaper } from './render'
import { letterLogo, toLetterData } from './data'

/** Live preview of a client's letter. */
export function LetterCanvas({ client, resolution = 1600, className = '' }: { client: Client; resolution?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const settings = useSettings()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [paper, logo] = await Promise.all([loadPaper(kindOf(client), client.style), letterLogo(client), loadLetterFonts()])
      if (cancelled || !ref.current) return
      const canvas = ref.current
      canvas.width = resolution
      canvas.height = Math.round((resolution * LETTER_H) / LETTER_W)
      drawLetter(canvas, client.style, paper, toLetterData(client, logo))
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [client, settings, resolution])

  return (
    <canvas
      ref={ref}
      className={`block h-auto w-full transition-opacity duration-700 ease-heavy ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ aspectRatio: `${LETTER_W} / ${LETTER_H}`, background: letterSpec(kindOf(client), client.style).paper }}
    />
  )
}
