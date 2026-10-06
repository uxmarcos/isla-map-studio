import { useSyncExternalStore } from 'react'
import type { Client, Dangers, Lang, MapData } from './types'
import { supabase } from './supabase'
import { downloadLogo, logoPathFor, removeLogos, uploadLogo } from './logos'
import { toast } from './ui/toast'
import { normalizeQrUrl } from './qr'

// Maps and settings live in Supabase (schema maps: tables clients and settings, logos in the
// maps-logos bucket), shared by Isla's super admins. The schema is a migration in isla-app.
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

/** Fills in fields added after a map was saved: white, English, default notes and dangers. */
function migrateClient(c: Client): Client {
  const lang = c.lang ?? 'en'
  return {
    ...c,
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
}

/** A database row back into a map: status and QR come from their columns, the logo from Storage. */
async function fromRow(r: Row): Promise<Client> {
  const logo = r.data.logoPath ? await downloadLogo(supabase!, r.data.logoPath) : null
  return migrateClient({ ...r.data, status: r.status, qrUrl: r.qr_url ?? '', logo })
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
  const data = { ...c, logo: null, logoPath }
  return { id: c.id, data, status: c.status, qr_url: normalizeQrUrl(c.qrUrl) || null, logoPath }
}

const deletedIds = new Set<string>()

const rowOnly = ({ id, data, status, qr_url }: Row) => ({ id, data, status, qr_url })

/** Keeps the path of what was uploaded, so the next save doesn't upload the same logo again. */
function remember(id: string, logoPath: string | null) {
  clients = clients.map((x) => (x.id === id ? { ...x, logoPath } : x))
}

async function load() {
  const [maps, sett] = await Promise.all([
    supabase!.from('clients').select('id, data, status, qr_url'),
    supabase!.from('settings').select('data').eq('id', 1).maybeSingle(),
  ])
  if (maps.error || sett.error) throw maps.error ?? sett.error
  clients = (await Promise.all((maps.data as Row[]).map(fromRow))).sort(byNewest)
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
    await load()
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

/** A blank map, in Portuguese, not saved until saveClient is called. */
export function newClient(): Client {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    company: '',
    slug: '',
    style: 'color',
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

/** A new map for the same client: everything personalised is kept (name, logo, goal, gift link, texts); status starts over. */
export function mapFrom(c: Client): Client {
  const fresh = newClient()
  return { ...structuredClone(c), id: fresh.id, clientId: c.clientId ?? c.id, status: 'draft', notes: '', createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }
}

/** Inserts or replaces a map: shown right away, then written to the database. */
export async function saveClient(c: Client) {
  const saved = { ...c, slug: c.slug || uniqueSlug(c.company, c.id), qrUrl: normalizeQrUrl(c.qrUrl), updatedAt: Date.now() }
  clients = clients.some((x) => x.id === c.id) ? clients.map((x) => (x.id === c.id ? saved : x)) : [saved, ...clients]
  emit()
  if (!supabase) return persistLocal()
  try {
    const r = await toRow(saved)
    const { error } = await supabase.from('clients').upsert(rowOnly(r))
    if (error) throw error
    remember(saved.id, r.logoPath)
  } catch (e) {
    fail(e)
  }
}

/** Adds many new maps at once (batch import): one write to the database. */
export async function saveClients(list: Client[]) {
  const now = Date.now()
  // Same creation instant would scramble the order; keep the list's order, first on top.
  const saved = list.map((c, i) => ({ ...c, qrUrl: normalizeQrUrl(c.qrUrl), createdAt: now - i, updatedAt: now }))
  clients = [...saved, ...clients].sort(byNewest)
  emit()
  if (!supabase) return persistLocal()
  try {
    const rows = await Promise.all(saved.map(toRow))
    const { error } = await supabase.from('clients').upsert(rows.map(rowOnly))
    if (error) throw error
    rows.forEach((r) => remember(r.id, r.logoPath))
  } catch (e) {
    fail(e)
  }
}

export async function deleteClient(id: string) {
  clients = clients.filter((c) => c.id !== id)
  emit()
  if (!supabase) return persistLocal()
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return fail(error)
  // Undo re-saves the map, logo included (it is still in memory), so the files can go now.
  deletedIds.add(id)
  removeLogos(supabase, id).catch(() => {})
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
    qrUrl: normalizeQrUrl(c.qrUrl),
  }
}
