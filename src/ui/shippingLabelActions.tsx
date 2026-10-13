import { useEffect, useRef, useState } from 'react'
import { attachShippingLabel, downloadLabel, getClient, removeShippingLabel } from '../store'
import type { Client, ShippingLabel } from '../types'
import { toast } from './toast'

type Busy = 'upload' | 'download' | 'remove'

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
export const date = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** "84 KB · anexada em 13/10/2026" */
export const labelMeta = (l: ShippingLabel) => `${size(l.size)} · anexada em ${date(l.uploadedAt)}`

/**
 * Attach, download and remove a map's shipping label, with one busy state per map.
 * Render `input` once; `pick` opens the file chooser for that map.
 */
export function useShippingLabelActions() {
  const [busy, setBusy] = useState<Record<string, Busy>>({})
  // State lags a render behind: a second drop right after the first must still see the map as busy.
  const running = useRef(new Set<string>())
  const target = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // A PDF dropped a little off its target would open in the tab, leaving the Studio.
  useEffect(() => {
    const block = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  async function track(id: string, kind: Busy, work: () => Promise<void>) {
    if (running.current.has(id)) return
    running.current.add(id)
    setBusy((b) => ({ ...b, [id]: kind }))
    try {
      await work()
    } catch (e) {
      toast(errorText(e), { tone: 'error' })
    } finally {
      running.current.delete(id)
      setBusy(({ [id]: _, ...rest }) => rest)
    }
  }

  const name = (id: string) => getClient(id)?.company || 'Sem nome'

  function attach(id: string, file?: File) {
    if (!file || running.current.has(id)) return
    const current = getClient(id)?.shippingLabel
    if (current && !confirm(`Substituir a etiqueta de ${name(id)} (${current.name})?`)) return
    track(id, 'upload', async () => {
      await attachShippingLabel(id, file)
      toast(`Etiqueta de ${name(id)} anexada.`)
    })
  }

  function pick(c: Client) {
    target.current = c.id
    fileRef.current?.click()
  }

  const download = (c: Client) => track(c.id, 'download', () => downloadLabel(c))

  function remove(c: Client) {
    if (!c.shippingLabel || !confirm(`Remover a etiqueta de ${c.company || 'Sem nome'}? O PDF é apagado.`)) return
    track(c.id, 'remove', async () => {
      await removeShippingLabel(c.id)
      toast(`Etiqueta de ${c.company || 'Sem nome'} removida.`)
    })
  }

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      onChange={(e) => {
        if (target.current) attach(target.current, e.target.files?.[0])
        e.target.value = '' // so picking the same file again still counts
      }}
    />
  )

  return { busy, pick, attach, download, remove, input }
}
