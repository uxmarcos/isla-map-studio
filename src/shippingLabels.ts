// Shipping labels (João's PDFs) live in the private `maps-shipping-labels` bucket, at
// <map id>/<content hash>.pdf; the map keeps only the path. Stored and served byte for byte:
// nothing is read from the PDF.
import type { SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import type { Client, ShippingLabel } from './types'
import { download } from './download'

/** Only Storage is used here, whatever database schema the client is set to. */
type Sb = Pick<SupabaseClient, 'storage'>

export const SHIPPING_LABEL_BUCKET = 'maps-shipping-labels'

/** Same limit as the bucket's file_size_limit. */
export const MAX_LABEL_BYTES = 10 * 1024 * 1024

async function hash(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Checks the file really is a PDF (the type can be empty on some systems, so the header decides). */
async function readPdf(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_LABEL_BYTES) throw new Error(`${file.name}: maior que ${MAX_LABEL_BYTES / 1024 / 1024} MB.`)
  const bytes = await file.arrayBuffer()
  const head = new TextDecoder().decode(bytes.slice(0, 5))
  if (head !== '%PDF-') throw new Error(`${file.name}: não é um PDF.`)
  return bytes
}

export async function uploadShippingLabel(sb: Sb, mapId: string, file: File): Promise<ShippingLabel> {
  const bytes = await readPdf(file)
  const path = `${mapId}/${await hash(bytes)}.pdf`
  const { error } = await sb.storage
    .from(SHIPPING_LABEL_BUCKET)
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true })
  if (error) throw error
  return { path, name: file.name, size: file.size, uploadedAt: Date.now() }
}

export async function fetchShippingLabel(sb: Sb, path: string): Promise<Blob> {
  const { data, error } = await sb.storage.from(SHIPPING_LABEL_BUCKET).download(path)
  if (error || !data) throw error ?? new Error('arquivo não encontrado')
  return data
}

/** Removes a map's label files, keeping `keep` (the current one) if given. */
export async function removeShippingLabels(sb: Sb, mapId: string, keep?: string | null) {
  const { data } = await sb.storage.from(SHIPPING_LABEL_BUCKET).list(mapId)
  const stale = (data ?? []).map((f) => `${mapId}/${f.name}`).filter((p) => p !== keep)
  if (stale.length) await sb.storage.from(SHIPPING_LABEL_BUCKET).remove(stale)
}

const labelBase = (c: Client) => `${c.slug || 'mapa'}-etiqueta`

/** Maps of the same client share the slug: number the repeats so no file in the .zip overwrites another. */
function uniqueNames(list: Client[]) {
  const seen = new Map<string, number>()
  return list.map((c) => {
    const base = labelBase(c)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}${n > 1 ? `-${n}` : ''}.pdf`
  })
}

export async function downloadShippingLabel(sb: Sb, c: Client) {
  if (!c.shippingLabel) throw new Error(`${c.company || 'Sem nome'}: sem etiqueta.`)
  download(await fetchShippingLabel(sb, c.shippingLabel.path), `${labelBase(c)}.pdf`)
}

/** One .zip with each map's label as its own PDF. Labels that fail to download are left out; returns their names. */
export async function downloadShippingLabelsZip(sb: Sb, all: Client[], onProgress?: (done: number) => void): Promise<string[]> {
  const list = all.filter((c) => c.shippingLabel)
  const names = uniqueNames(list)
  const failed: string[] = []
  const zip = new JSZip()
  let next = 0
  let done = 0
  // A few downloads at a time: one by one is slow for a whole batch, all at once floods Storage.
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      try {
        zip.file(names[i], await fetchShippingLabel(sb, list[i].shippingLabel!.path))
      } catch {
        failed.push(list[i].company || 'Sem nome')
      }
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker))
  if (failed.length < list.length)
    download(await zip.generateAsync({ type: 'blob' }), `isla-etiquetas-${new Date().toISOString().slice(0, 10)}.zip`)
  return failed
}
