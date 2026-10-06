// Batch import: rows from a CSV/JSON -> map fields -> logos -> new maps.
import type { Client, Lang, MapStyle } from '../types'
import { DEFAULT_DANGERS, DEFAULT_NOTES, newClient, uniqueSlug, type Settings } from '../store'
import { fileToLogo } from '../map/logo'
import type { RawRow } from './parse'
import { normalizeQrUrl } from '../qr'

/** One map to create, as shown (and editable) in the import preview. */
export interface ImportRow {
  row: number
  company: string
  /** The gift's link from /admin/gifts (<base>/<slug>), copied as is; normalized when the map is created. */
  qr: string
  goal: string
  lang: Lang
  style: MapStyle
  /** As given in the list: URL, file name, data URL, or empty. */
  logo: string
  warning: string
}

/** Reads the rows by their column names (the ones in the base table, plus common PT/EN variants). */
export const interpret = (raw: RawRow[]): ImportRow[] => raw.map(localRow)

// Local reading: known column names in PT and EN.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const ALIASES: Record<'company' | 'qr' | 'goal' | 'lang' | 'style' | 'logo', string[]> = {
  company: ['empresa', 'company', 'nome', 'name', 'cliente', 'client', 'companyname', 'nomedaempresa', 'razaosocial'],
  // 'demo': the column's name in older lists.
  qr: ['qr', 'urldoqr', 'qrurl', 'linkdoqr', 'linkdopresente', 'presente', 'gift', 'giftlink', 'gifturl', 'url', 'link', 'demo'],
  goal: ['meta', 'metafinal', 'goal', 'objetivo', 'destino', 'destination', 'target', 'tesouro'],
  lang: ['idioma', 'lang', 'language', 'lingua'],
  style: ['estilo', 'style', 'versao', 'cor', 'colorido', 'tipo', 'mapa'],
  logo: ['logo', 'logourl', 'logotipo', 'logomarca', 'urldologo', 'imagem'],
}

function pick(r: RawRow, field: keyof typeof ALIASES) {
  const keys = Object.keys(r)
  for (const alias of ALIASES[field]) {
    const k = keys.find((key) => norm(key) === alias)
    if (k) return { key: norm(k), value: r[k].trim() }
  }
  return { key: '', value: '' }
}

export function readLang(v: string): Lang | null {
  const s = norm(v)
  if (!s) return null
  if (['pt', 'ptbr', 'br', 'portugues', 'portuguese', 'brasil', 'brazil'].includes(s)) return 'pt'
  if (['en', 'enus', 'us', 'ingles', 'english', 'eng'].includes(s)) return 'en'
  return null
}

export function readStyle(v: string, column = ''): MapStyle | null {
  const s = norm(v)
  if (!s) return null
  // A yes/no "colorido" column.
  if (column === 'colorido') return ['sim', 'yes', 's', 'y', 'true', '1', 'x'].includes(s) ? 'color' : 'white'
  if (['color', 'colorido', 'colored', 'colour', 'cor', 'colorida'].includes(s)) return 'color'
  if (['white', 'branco', 'branca', 'claro', 'light', 'pb'].includes(s)) return 'white'
  if (['dark', 'preto', 'preta', 'escuro', 'black'].includes(s)) return 'dark'
  return null
}

function localRow(r: RawRow, i: number): ImportRow {
  const company = pick(r, 'company').value
  const goal = pick(r, 'goal').value
  const langIn = pick(r, 'lang').value
  const styleIn = pick(r, 'style')
  const lang = readLang(langIn)
  const style = readStyle(styleIn.value, styleIn.key)
  const warnings = [
    langIn && !lang && `Idioma "${langIn}" não reconhecido; usei português.`,
    styleIn.value && !style && `Estilo "${styleIn.value}" não reconhecido; usei colorido.`,
  ].filter(Boolean)
  return {
    row: i, company, qr: pick(r, 'qr').value, goal, lang: lang ?? 'pt', style: style ?? 'color',
    logo: pick(r, 'logo').value, warning: warnings.join(' '),
  }
}

const isSvgCode = (v: string) => /^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(v)

/** Something an <img> can show for a logo cell: data URL, pasted SVG code, or a link (null otherwise). */
export function logoSrc(value: string): string | null {
  const v = value.trim()
  if (v.startsWith('data:image') || /^https?:\/\//i.test(v)) return v
  if (isSvgCode(v)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`
  return null
}

/** Loads a row's logo: an embedded image or pasted SVG code, or a URL (directly, then through /api/logo). PNG, JPG, SVG or WebP. */
export async function loadRowLogo(r: ImportRow): Promise<{ logo: string | null; problem?: string }> {
  const v = r.logo.trim()
  const asLogo = (blob: Blob) => fileToLogo(new File([blob], 'logo', { type: blob.type }))
  try {
    if (!v) return { logo: null }
    if (isSvgCode(v)) return { logo: await asLogo(new Blob([v], { type: 'image/svg+xml' })) }
    if (v.startsWith('data:image')) return { logo: await asLogo(await (await fetch(v)).blob()) }
    if (!/^https?:\/\//i.test(v)) return { logo: null, problem: `"${v.slice(0, 60)}" não é um link de imagem.` }
    const direct = await fetch(v).then((res) => (res.ok ? res.blob() : null)).catch(() => null)
    const blob = direct?.type.startsWith('image/')
      ? direct
      : await fetch(`/api/logo?url=${encodeURIComponent(v)}`).then((res) => (res.ok ? res.blob() : null)).catch(() => null)
    if (!blob?.type.startsWith('image/')) return { logo: null, problem: 'Não consegui baixar o logo do link.' }
    return { logo: await asLogo(blob) }
  } catch {
    return { logo: null, problem: 'Não consegui ler o logo.' }
  }
}

/** Slugs (file names, grouping) for a whole batch: from the company, unique across the batch. */
export function batchSlugs(rows: ImportRow[]): string[] {
  const taken = new Set<string>()
  return rows.map((r) => {
    const base = r.company || 'company'
    let slug = uniqueSlug(base)
    for (let i = 2; taken.has(slug); i++) slug = uniqueSlug(`${base}-${i}`)
    taken.add(slug)
    return slug
  })
}

/** A new map from an import row, with the defaults of its language. */
export function toClient(r: ImportRow, slug: string, logo: string | null, settings: Settings): Client {
  const goal = r.goal.trim()
  return {
    ...newClient(),
    company: r.company.trim(),
    slug,
    style: r.style,
    lang: r.lang,
    goal,
    destination: goal,
    stages: [...settings.defaultStages[r.lang]],
    stageNotes: [...DEFAULT_NOTES[r.lang]],
    dangers: { ...DEFAULT_DANGERS[r.lang] },
    logo,
    qrUrl: normalizeQrUrl(r.qr),
    notes: 'Importado em lote.',
  }
}
