import { useSyncExternalStore } from 'react'
import { kindOf, type Client, type Dangers, type Kind, type Lang, type MapData, type ShippingLabel } from './types'
import { supabase } from './supabase'
import { downloadLogo, logoPathFor, removeLogos, uploadLogo } from './logos'
import { toast } from './ui/toast'
import { normalizeQrUrl } from './qr'
import { downloadShippingLabel, downloadShippingLabelsZip, removeShippingLabels, SHIPPING_LABEL_BUCKET, uploadShippingLabel } from './shippingLabels'

// Maps and settings live in Supabase (schema maps: tables clients and settings, logos in the
// maps-logos bucket, shipping label PDFs in maps-shipping-labels), shared by Isla's super admins. The schema is a migration in isla-app.
// These keys are the old browser-only storage, kept for importing.
const KEY = 'isla-map-clients:v1'
const SETTINGS_KEY = 'isla-map-settings:v1'

export interface Settings {
  defaultStages: Record<Lang, string[]>
}

export const DEFAULT_SETTINGS: Settings = {
  defaultStages: {
    en: ['Find your voice', 'Grow your ICP network', 'Show up every week', 'Warm the right buyers', 'Book the meetings'],
    pt: ['Encontre sua voz', 'Cresça sua rede de ICP', 'Apareça toda semana', 'Aqueça os compradores certos', 'Agende as reuniões'],
  },
}

/** What Isla does on each island, under the stage plaques. */
export const DEFAULT_NOTES: Record<Lang, string[]> = {
  en: [
    'Your Isla professional learns your voice',
    'Isla agents grow your ICP network',
    'Isla writes and schedules your posts',
    'Isla warms the buyers who notice you',
    'You approve. Isla sends the DM.',
  ],
  pt: [
    'Seu profissional Isla aprende sua voz',
    'Agentes da Isla crescem sua rede de ICP',
    'A Isla escreve e agenda seus posts',
    'A Isla aquece quem já notou você',
    'Você aprova. A Isla envia a DM.',
  ],
}

/** What Isla protects the client from, on the sea creatures. */
export const DEFAULT_DANGERS: Record<Lang, Dangers> = {
  // The whirlpool starts empty: its label only appears once someone writes it for this client.
  en: { kraken: 'weeks without posting', whirlpool: '' },
  pt: { kraken: 'semanas sem postar', whirlpool: '' },
}

/** The whirlpool took over the whale's danger label. */
function migrateDangers(d: (Partial<Dangers> & { whale?: string }) | undefined, lang: Lang): Dangers {
  if (!d) return { ...DEFAULT_DANGERS[lang] }
  return { kraken: d.kraken ?? DEFAULT_DANGERS[lang].kraken, whirlpool: d.whirlpool ?? d.whale ?? DEFAULT_DANGERS[lang].whirlpool }
}

/** Fills in fields added after a map was saved: the track, white, English, default notes and dangers. */
function migrateClient(c: Client): Client {
  const lang = c.lang ?? 'en'
  return {
    ...c,
    kind: kindOf(c),
    style: c.style ?? 'white',
    lang,
    stageNotes: c.stageNotes ?? [...DEFAULT_NOTES[lang]],
    start: c.start ?? '',
    dangers: migrateDangers(c.dangers, lang),
  }
}

function migrateSettings(s: Partial<Settings>): Settings {
  // Default stages used to be a single English list.
  const stages = Array.isArray(s.defaultStages) ? { ...DEFAULT_SETTINGS.defaultStages, en: s.defaultStages } : s.defaultStages
  return { ...DEFAULT_SETTINGS, ...s, defaultStages: { ...DEFAULT_SETTINGS.defaultStages, ...stages } }
}

export type SyncState =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'denied' } // signed in, but not an Isla super admin
  | { state: 'error'; message: string }

let clients: Client[] = []
let settings: Settings = DEFAULT_SETTINGS
let sync: SyncState = { state: 'loading' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const byNewest = (a: Client, b: Client) => b.createdAt - a.createdAt

function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(clients))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    toast('Não foi possível salvar: o armazenamento do navegador está cheio. Tente um logo menor.', { tone: 'error' })
    console.error(e)
  }
}

function fail(e: unknown) {
  console.error(e)
  toast(`Não foi possível salvar no banco: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`, { tone: 'error' })
}

interface Row {
  id: string
  data: Client
  status: Client['status']
  qr_url: string | null
  /** Its own column, written only by setShippingLabel: saving the rest of the map never touches it. */
  shipping_label?: ShippingLabel | null
}

/** A database row back into a map: status and QR come from their columns, the logo from Storage. */
async function fromRow(r: Row): Promise<Client> {
  const logo = r.data.logoPath ? await downloadLogo(supabase!, r.data.logoPath) : null
  return migrateClient({ ...r.data, status: r.status, qrUrl: r.qr_url ?? '', shippingLabel: r.shipping_label ?? null, logo })
}

/** A map into a row: the logo goes to Storage (uploaded only when it changed), the row keeps its path. */
async function toRow(c: Client): Promise<Row & { logoPath: string | null }> {
  const logoPath = c.logo ? await logoPathFor(c.id, c.logo) : null
  // A deleted map's files are gone; if it comes back (Undo), upload again.
  const restored = deletedIds.delete(c.id)
  if (c.logo && logoPath && (logoPath !== c.logoPath || restored)) {
    await uploadLogo(supabase!, logoPath, c.logo)
    removeLogos(supabase!, c.id, logoPath).catch(() => {}) // the old file, if the logo changed
  } else if (!c.logo && c.logoPath) removeLogos(supabase!, c.id).catch(() => {})
  const data = { ...c, logo: null, logoPath, shippingLabel: undefined }
  return { id: c.id, data, status: c.status, qr_url: normalizeQrUrl(c.qrUrl) || null, shipping_label: c.shippingLabel ?? null, logoPath }
}

const deletedIds = new Set<string>()

const rowOnly = ({ id, data, status, qr_url }: Row) => ({ id, data, status, qr_url })
/** For rows the database doesn't have yet (new maps, Undo of a delete): they bring their label along. */
const newRow = (r: Row) => ({ ...rowOnly(r), shipping_label: r.shipping_label ?? null })

/** Keeps the path of what was uploaded, so the next save doesn't upload the same logo again. */
function remember(id: string, logoPath: string | null) {
  clients = clients.map((x) => (x.id === id ? { ...x, logoPath } : x))
}

/**
 * Writes in flight, and a count bumped as each starts and ends: a reload that overlaps a write
 * (e.g. closing the file chooser refocuses the tab mid-attach) would bring back the old row.
 */
let pending = 0
let writes = 0
async function tracked<T>(work: () => Promise<T>): Promise<T> {
  pending++
  writes++
  try {
    return await work()
  } finally {
    pending--
    writes++
  }
}

/** Until isla-v2's maps_shipping_labels migration is applied the column is missing: maps still load. */
async function selectMaps() {
  const maps = await supabase!.from('clients').select('id, data, status, qr_url, shipping_label')
  return maps.error?.code === '42703' ? supabase!.from('clients').select('id, data, status, qr_url') : maps
}

/** keep: the first load after sign-in, which must land even if a write overlaps it. */
async function load({ keep = false } = {}) {
  const seen = writes
  const [maps, sett] = await Promise.all([selectMaps(), supabase!.from('settings').select('data').eq('id', 1).maybeSingle()])
  if (maps.error || sett.error) throw maps.error ?? sett.error
  const loaded = (await Promise.all((maps.data as Row[]).map(fromRow))).sort(byNewest)
  if (!keep && (pending || seen !== writes)) return
  clients = loaded
  settings = migrateSettings((sett.data?.data as Partial<Settings>) ?? {})
}

let lastLoad = 0
/** Teammates' changes show up when you come back to the tab (no realtime: it would touch a shared publication). */
async function refresh() {
  if (!supabase || sync.state !== 'ready' || Date.now() - lastLoad < 15_000) return
  lastLoad = Date.now()
  try {
    await load()
    emit()
  } catch (e) {
    console.error(e)
  }
}
if (typeof window !== 'undefined') window.addEventListener('focus', refresh)

/** Loads everything for the signed-in user, after checking they are an Isla super admin. */
export async function connect() {
  if (!supabase) {
    // Browser-only mode (REQUIRE_LOGIN off).
    clients = read<Client[]>(KEY, []).map(migrateClient).sort(byNewest)
    settings = migrateSettings(read<Partial<Settings>>(SETTINGS_KEY, {}))
    sync = { state: 'ready' }
    return emit()
  }
  sync = { state: 'loading' }
  emit()
  const admin = await supabase.rpc('is_super_admin')
  if (admin.error) {
    // PGRST106: the project's API doesn't serve the maps schema yet (Settings -> API -> Exposed schemas).
    const message =
      admin.error.code === 'PGRST106'
        ? 'O schema maps não está exposto na API do Supabase. No painel do projeto: Settings → API → Exposed schemas → adicionar maps.'
        : admin.error.message
    sync = { state: 'error', message }
    return emit()
  }
  if (!admin.data) {
    sync = { state: 'denied' }
    return emit()
  }
  try {
    await load({ keep: true })
    lastLoad = Date.now()
    sync = { state: 'ready' }
  } catch (e) {
    sync = { state: 'error', message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }
  }
  emit()
}

export function disconnect() {
  clients = []
  settings = DEFAULT_SETTINGS
  sync = { state: 'loading' }
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSync = () => useSyncExternalStore(subscribe, () => sync)
export const useClients = () => useSyncExternalStore(subscribe, () => clients)
export const useSettings = () => useSyncExternalStore(subscribe, () => settings)
export const getClient = (id: string) => clients.find((c) => c.id === id)

export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueSlug(base: string, exceptId?: string) {
  const root = slugify(base) || 'company'
  let slug = root
  let i = 2
  while (clients.some((c) => c.slug === slug && c.id !== exceptId)) slug = `${root}-${i++}`
  return slug
}

/** The goal every new map starts with, printed at the X. */
export const DEFAULT_GOAL = 'Transforme seu LinkedIn em pipeline'
/** The default goal is an imperative, which doesn't read after "O caminho até": the subtitle uses this instead. */
const DEFAULT_PATH_TO = 'Transformar seu LinkedIn em pipeline'

/**
 * A blank piece, in Portuguese, not saved until saveClient is called. A coin's letter ignores the
 * route fields (stages, notes, start, dangers), which stay at their defaults: one type, one store.
 */
export function newClient(kind: Kind = 'map'): Client {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    kind,
    company: '',
    slug: '',
    // The coin track is black and white: it has no colour sheet to start on.
    style: kind === 'coin' ? 'white' : 'color',
    lang: 'pt',
    goal: DEFAULT_GOAL,
    stages: [...settings.defaultStages.pt],
    stageNotes: [...DEFAULT_NOTES.pt],
    start: '',
    dangers: { ...DEFAULT_DANGERS.pt },
    destination: DEFAULT_GOAL,
    logo: null,
    logoMode: 'original',
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** A new piece for the same client: the track and everything personalised are kept (name, logo, goal, gift link, texts); status and shipping label start over. */
export function mapFrom(c: Client): Client {
  const fresh = newClient()
  return { ...structuredClone(c), id: fresh.id, clientId: c.clientId ?? c.id, status: 'draft', notes: '', shippingLabel: null, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }
}

/** Inserts or replaces a map: shown right away, then written to the database. */
export async function saveClient(c: Client) {
  // The label is attached outside the editor's form: a stale copy in the form must not undo it.
  const existing = getClient(c.id)
  const shippingLabel = existing ? existing.shippingLabel : c.shippingLabel
  const saved = { ...c, shippingLabel, slug: c.slug || uniqueSlug(c.company, c.id), qrUrl: normalizeQrUrl(c.qrUrl), updatedAt: Date.now() }
  clients = existing ? clients.map((x) => (x.id === c.id ? saved : x)) : [saved, ...clients]
  emit()
  if (!supabase) return persistLocal()
  const write = tracked(async () => {
    try {
      const r = await toRow(saved)
      const { error } = await supabase!.from('clients').upsert(existing ? rowOnly(r) : newRow(r))
      if (error) throw error
      remember(saved.id, r.logoPath)
    } catch (e) {
      fail(e)
    }
  })
  saving.set(saved.id, write)
  await write
  if (saving.get(saved.id) === write) saving.delete(saved.id)
}

/** Saves still on their way to the database, by map: a label attached right after Save waits for the row. */
const saving = new Map<string, Promise<void>>()

/** Adds many new maps at once (batch import): one write to the database. */
export async function saveClients(list: Client[]) {
  const now = Date.now()
  // Same creation instant would scramble the order; keep the list's order, first on top.
  const saved = list.map((c, i) => ({ ...c, qrUrl: normalizeQrUrl(c.qrUrl), createdAt: now - i, updatedAt: now }))
  clients = [...saved, ...clients].sort(byNewest)
  emit()
  if (!supabase) return persistLocal()
  await tracked(async () => {
    try {
      const rows = await Promise.all(saved.map(toRow))
      const { error } = await supabase!.from('clients').upsert(rows.map(newRow))
      if (error) throw error
      rows.forEach((r) => remember(r.id, r.logoPath))
    } catch (e) {
      fail(e)
    }
  })
}

/** Shipping labels are PDFs in Storage: too big for the browser-only mode. */
export const shippingLabelsEnabled = !!supabase

/**
 * Sets a saved map's label: only its column is written, so a teammate's edits to the map aren't
 * undone, nor theirs to the label by a later Save here. On failure memory goes back and it throws.
 */
async function setShippingLabel(id: string, shippingLabel: ShippingLabel | null) {
  const before = getClient(id)
  if (!before) throw new Error('Salve o mapa antes de anexar a etiqueta.')
  const put = (l: ShippingLabel | null | undefined) => {
    clients = clients.map((x) => (x.id === id ? { ...x, shippingLabel: l } : x))
    emit()
  }
  put(shippingLabel)
  await tracked(async () => {
    try {
      await saving.get(id)
      const { data, error } = await supabase!.from('clients').update({ shipping_label: shippingLabel }).eq('id', id).select('id')
      if (error) throw error
      // Its save failed, or a teammate deleted it.
      if (!data?.length) throw new Error('Este mapa não está no banco. Salve o mapa e tente de novo.')
    } catch (e) {
      put(before.shippingLabel)
      throw e
    }
  })
}

/** One label change at a time per map, cleanup included, so one change never deletes the file of the next. */
const labelQueue = new Map<string, Promise<unknown>>()
function serial<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (labelQueue.get(id) ?? Promise.resolve()).catch(() => {}).then(work)
  labelQueue.set(id, next)
  next.catch(() => {}).finally(() => labelQueue.get(id) === next && labelQueue.delete(id))
  return next
}

/** Uploads the PDF and attaches it to the map, replacing (and deleting) the previous label. */
export function attachShippingLabel(id: string, file: File) {
  const sb = supabase
  if (!sb) return Promise.reject(new Error('Etiquetas precisam do banco da equipe.'))
  return serial(id, async () => {
    if (!getClient(id)) throw new Error('Salve o mapa antes de anexar a etiqueta.')
    const previous = getClient(id)?.shippingLabel?.path
    const label = await uploadShippingLabel(sb, id, file)
    try {
      await setShippingLabel(id, label)
    } catch (e) {
      // The map still points at the old file: drop the new one unless it is the same content.
      if (label.path !== getClient(id)?.shippingLabel?.path) await sb.storage.from(SHIPPING_LABEL_BUCKET).remove([label.path]).catch(() => {})
      throw e
    }
    // Only the file this map pointed at: a teammate's upload in the same folder may be on its way in.
    if (previous && previous !== label.path) await sb.storage.from(SHIPPING_LABEL_BUCKET).remove([previous]).catch(() => {})
  })
}

/** Detaches the label first, then deletes its file, so a map never points at a missing PDF. */
export function removeShippingLabel(id: string) {
  const sb = supabase
  if (!sb) return Promise.reject(new Error('Etiquetas precisam do banco da equipe.'))
  return serial(id, async () => {
    const previous = getClient(id)?.shippingLabel?.path
    await setShippingLabel(id, null)
    if (previous) await sb.storage.from(SHIPPING_LABEL_BUCKET).remove([previous]).catch(() => {})
  })
}

export async function downloadLabel(c: Client) {
  if (!supabase) throw new Error('Etiquetas precisam do banco da equipe.')
  await downloadShippingLabel(supabase, c)
}

/** Returns the names of the maps whose label couldn't be downloaded. */
export async function downloadLabelsZip(list: Client[], onProgress?: (done: number) => void) {
  if (!supabase) throw new Error('Etiquetas precisam do banco da equipe.')
  return downloadShippingLabelsZip(supabase, list, onProgress)
}

export async function deleteClient(id: string) {
  clients = clients.filter((c) => c.id !== id)
  emit()
  if (!supabase) return persistLocal()
  const { error } = await tracked(async () => supabase!.from('clients').delete().eq('id', id))
  if (error) return fail(error)
  // Undo re-saves the map, logo included (it is still in memory), so the files can go now.
  deletedIds.add(id)
  removeLogos(supabase, id).catch(() => {})
  // The label PDF isn't in memory, so it waits out the Undo toast (8 s) before going. Closing the
  // tab before then leaves the file in the bucket; a sweep could delete a teammate's new upload.
  setTimeout(() => {
    if (!getClient(id)) removeShippingLabels(supabase!, id).catch(() => {})
  }, 15_000)
}

let settingsTimer: ReturnType<typeof setTimeout> | undefined
/** Settings are edited per keystroke, so writes are debounced. */
export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch }
  emit()
  if (!supabase) return persistLocal()
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(async () => {
    const { error } = await supabase!.from('settings').upsert({ id: 1, data: settings })
    if (error) fail(error)
  }, 600)
}

/** Maps saved in this browser before the database existed. */
export function localMaps(): Client[] {
  if (!supabase) return [] // already the browser's own list
  const ids = new Set(clients.map((c) => c.id))
  return read<Client[]>(KEY, []).map(migrateClient).filter((c) => !ids.has(c.id))
}

/** Sends this browser's maps to the database, then forgets the local copy. */
export async function importLocalMaps() {
  const list = localMaps()
  if (!list.length) return 0
  const rows = await Promise.all(list.map(toRow))
  const { error } = await supabase!.from('clients').upsert(rows.map(rowOnly))
  if (error) throw error
  list.forEach((c, i) => (c.logoPath = rows[i].logoPath))
  clients = [...clients, ...list].sort(byNewest)
  emit()
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(SETTINGS_KEY)
  } catch {
    // Nothing to clean up.
  }
  return list.length
}

export function toMapData(c: Client): MapData {
  return {
    lang: c.lang,
    company: c.company,
    stages: c.stages,
    stageNotes: c.stageNotes ?? DEFAULT_NOTES[c.lang ?? 'en'],
    start: c.start ?? '',
    dangers: migrateDangers(c.dangers, c.lang ?? 'en'),
    destination: c.destination,
    pathTo: c.destination.trim() === DEFAULT_GOAL ? DEFAULT_PATH_TO : c.pathTo?.trim() ?? '',
    qrUrl: normalizeQrUrl(c.qrUrl),
  }
}
