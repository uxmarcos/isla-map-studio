export type Status = 'draft' | 'ready' | 'printed' | 'shipped'

/**
 * What the client receives: the chest with the treasure map (and its letter), or the case with the
 * NFC coin, which carries only a letter. The two tracks share everything but the printed artwork.
 */
export type Kind = 'map' | 'coin'

/** The printed piece of each track. */
export const KIND_LABEL: Record<Kind, string> = { map: 'Mapa', coin: 'Carta' }
export const KIND_PLURAL: Record<Kind, string> = { map: 'mapas', coin: 'cartas' }

export type LogoMode = 'ink' | 'gray' | 'original' | 'hidden'

export type MapStyle = 'white' | 'dark' | 'color'

export type Lang = 'en' | 'pt'

export const LANG_LABEL: Record<Lang, string> = { en: 'English', pt: 'Português' }
export const LANG_ORDER: Lang[] = ['pt', 'en']

export const STYLE_LABEL: Record<MapStyle, string> = { white: 'Branco', dark: 'Preto', color: 'Colorido' }
export const STYLE_ORDER: MapStyle[] = ['color', 'white', 'dark']

export interface LetterStep {
  title: string
  text: string
}

/** Everything written on the letter. {company} and {goal} are filled in from the map. */
export interface LetterText {
  eyebrow: string
  title: string
  intro: string
  howTitle: string
  steps: LetterStep[]
  /**
   * The coin's letter only: the client's goal, printed after the steps that lead to it. It carries
   * what the map prints by the X, which a case with a coin has nowhere to put. Absent on the map's
   * letter, which has the map itself; the renderer draws it only when it is set.
   */
  goalLine?: string
  closing: string
  signoff: string
  /**
   * The coin's letter only: Isla's own address, on the footer's axis. Not the gift link, which is
   * printed under the QR; the map's letter leaves this out because its footer centre is taken.
   */
  site?: string
  /** Under the QR. On the coin the QR is the fallback, so this reads as the second way in. */
  qrCaption: string
  /** The NFC gesture: the chest's logo on the map's letter, the coin itself on the coin's. */
  nfcCaption: string
}

export interface Dangers {
  kraken: string
  whirlpool: string
}

/** The shipping label's PDF, attached as-is (nothing is read from it); the file lives in Storage. */
export interface ShippingLabel {
  /** Storage path in the maps-shipping-labels bucket. */
  path: string
  /** The file's name when it was attached, to recognise it in the list. */
  name: string
  size: number
  uploadedAt: number
}

export interface Client {
  id: string
  /** Missing on everything saved before the coin track existed, which is all maps: see kindOf. */
  kind?: Kind
  /** Links maps of the same client: set on maps started from another one ("Novo mapa" in Clientes). */
  clientId?: string
  company: string
  slug: string
  style: MapStyle
  /** Language of everything printed on the map. */
  lang: Lang
  /** Kept equal to destination; older maps may differ. */
  goal: string
  /** Five stage plaques along the path. */
  stages: string[]
  /** One line under each stage plaque: what Isla does there. */
  stageNotes: string[]
  /** "You are here": the client's real starting point. Empty hides the tag. */
  start: string
  /** Labels on the sea creatures: what Isla protects the client from. Empty hides a label. */
  dangers: Dangers
  /** Last plaque, next to the X. */
  destination: string
  /** Subtitle after "The path to" / "O caminho até", when it must read differently from the X (e.g. "Transformar…"). Empty uses destination. */
  pathTo?: string
  logo: string | null // PNG data URL, downscaled (in memory; the database keeps it in Storage at logoPath)
  /** Storage path of the logo in the maps-logos bucket (database mode). */
  logoPath?: string | null
  /** The gift's dynamic link from isla-app's /admin/gifts, printed in the QR exactly as given. */
  qrUrl?: string
  logoMode: LogoMode
  /** Edited letter text; anything missing falls back to the default for the map's language. */
  letter?: Partial<LetterText>
  /** One per map (one map = one box). Changed only by attachShippingLabel/removeShippingLabel, never by the editor's Save. */
  shippingLabel?: ShippingLabel | null
  status: Status
  notes: string
  createdAt: number
  updatedAt: number
}

/** A map saved before the coin track has no kind, and every one of them is a map. */
export const kindOf = (c: Pick<Client, 'kind'>): Kind => c.kind ?? 'map'

/** What the renderer needs; derived from a Client. */
export interface MapData {
  lang: Lang
  company: string
  stages: string[]
  stageNotes: string[]
  start: string
  dangers: Dangers
  /** Last plaque, and the subtitle unless pathTo is set. */
  destination: string
  /** Subtitle after "The path to" / "O caminho até"; empty uses destination. */
  pathTo: string
  /** Encoded in the QR exactly as given; empty until it is pasted (exports are blocked then). */
  qrUrl: string
}

export const STATUS_LABEL: Record<Status, string> = {
  draft: 'Rascunho',
  ready: 'Pronto para imprimir',
  printed: 'Impresso',
  shipped: 'Enviado',
}

export const STATUS_ORDER: Status[] = ['draft', 'ready', 'printed', 'shipped']
