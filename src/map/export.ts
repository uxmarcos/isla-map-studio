import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import type { Client } from '../types'
import { toMapData } from '../store'
import { TEMPLATES } from './layout'
import { processLogo } from './logo'
import { drawMap, loadMapFonts, loadTemplate } from './render'
import { drawLetter, LETTER_H, LETTER_W, loadLetterFonts, loadPaper } from '../letter/render'
import { letterLogo, toLetterData } from '../letter/data'
import { checkQrUrl } from '../qr'
import { download } from '../download'

/** A map printed without its gift link loses the gift: never export one. */
function assertQr(c: Client) {
  const q = checkQrUrl(c.qrUrl)
  if (!q.ok) throw new Error(`${c.company || 'Mapa sem nome'}: ${q.error}`)
}

// Print size: A4 landscape (the letter is A4 portrait).
export const PRINT_MM = { w: 297, h: 210 }

/**
 * Office printers can't print to the edge, so the "with margin" PDF shrinks the sheet into
 * a white border this wide (mm), keeping its proportions. The full-bleed one is for print shops.
 */
export const SAFE_MARGIN_MM = 6

export interface PdfOptions { margin?: boolean }

/** Where the image goes on the page: the whole page, or centred inside the safe margin. */
function placement(pageW: number, pageH: number, margin?: boolean) {
  if (!margin) return { x: 0, y: 0, w: pageW, h: pageH }
  const k = Math.min((pageW - 2 * SAFE_MARGIN_MM) / pageW, (pageH - 2 * SAFE_MARGIN_MM) / pageH)
  const w = pageW * k, h = pageH * k
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h }
}

/** Renders a client's map at full template resolution. */
export async function renderFull(c: Client): Promise<HTMLCanvasElement> {
  assertQr(c)
  const t = TEMPLATES[c.style]
  const [template] = await Promise.all([loadTemplate(c.style), loadMapFonts()])
  const logo = c.logo ? await processLogo(c.logo, c.logoMode, t.ink) : null
  const canvas = document.createElement('canvas')
  canvas.width = t.w
  canvas.height = t.h
  drawMap(canvas, c.style, template, toMapData(c), logo)
  return canvas
}

/** Renders a client's letter at full A4 resolution (300 dpi). */
export async function renderLetter(c: Client): Promise<HTMLCanvasElement> {
  assertQr(c)
  const [paper, logo] = await Promise.all([loadPaper(c.style), letterLogo(c), loadLetterFonts()])
  const canvas = document.createElement('canvas')
  canvas.width = LETTER_W
  canvas.height = LETTER_H
  drawLetter(canvas, c.style, paper, toLetterData(c, logo))
  return canvas
}

const letterBase = (c: Client) => `${c.slug || 'company'}-letter-${c.style}-${c.lang}`

async function letterPdfBlob(c: Client, o: PdfOptions = {}): Promise<Blob> {
  const canvas = await renderLetter(c)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `${c.company} — Letter`, creator: 'Isla Map Studio' })
  const p = placement(210, 297, o.margin)
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', p.x, p.y, p.w, p.h, undefined, 'NONE')
  return pdf.output('blob')
}

export async function downloadLetterPng(c: Client) {
  download(await toBlob(await renderLetter(c), 'image/png'), `${letterBase(c)}.png`)
}

export async function downloadLetterPdf(c: Client, o: PdfOptions = {}) {
  download(await letterPdfBlob(c, o), `${letterBase(c)}${o.margin ? '-margem' : ''}.pdf`)
}

const fileBase = (c: Client) => `${c.slug || 'company'}-treasure-map-${c.style}-${c.lang}`

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), type, quality))
}

async function pdfBlob(c: Client, o: PdfOptions = {}): Promise<Blob> {
  const canvas = await renderFull(c)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `${c.company} — Treasure Map`, creator: 'Isla Map Studio' })
  const p = placement(PRINT_MM.w, PRINT_MM.h, o.margin)
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', p.x, p.y, p.w, p.h, undefined, 'NONE')
  return pdf.output('blob')
}

export async function downloadPng(c: Client) {
  download(await toBlob(await renderFull(c), 'image/png'), `${fileBase(c)}.png`)
}

export async function downloadPdf(c: Client, o: PdfOptions = {}) {
  download(await pdfBlob(c, o), `${fileBase(c)}${o.margin ? '-margem' : ''}.pdf`)
}

/**
 * Pieces without a valid gift link (missing, old or malformed) are left out; returns their names.
 * letterOnly: the coin track, which has no map to print.
 */
export async function downloadZip(all: Client[], onProgress?: (done: number) => void, letterOnly = false): Promise<string[]> {
  const skipped = all.filter((c) => !checkQrUrl(c.qrUrl).ok).map((c) => c.company || 'Sem nome')
  const list = all.filter((c) => checkQrUrl(c.qrUrl).ok)
  if (!list.length) return skipped
  const zip = new JSZip()
  for (let i = 0; i < list.length; i++) {
    if (!letterOnly) zip.file(`${fileBase(list[i])}.pdf`, await pdfBlob(list[i]))
    zip.file(`${letterBase(list[i])}.pdf`, await letterPdfBlob(list[i]))
    onProgress?.(i + 1)
  }
  const name = letterOnly ? 'isla-trilha-moeda' : 'isla-treasure-maps'
  download(await zip.generateAsync({ type: 'blob' }), `${name}-${new Date().toISOString().slice(0, 10)}.zip`)
  return skipped
}
