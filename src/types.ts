export type Status = 'draft' | 'ready' | 'printed' | 'shipped'

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
  closing: string
  signoff: string
  qrCaption: string
  /** Beside the QR: the chest's logo is an NFC tag that opens the same gift. */
  nfcCaption: string
}

export interface Dangers {
  kraken: string
  whirlpool: string
}

export interface Client {
  id: string
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
  logo: string | null // PNG data URL, downscaled (in memory; the database keeps it in Storage at logoPath)
  /** Storage path of the logo in the maps-logos bucket (database mode). */
  logoPath?: string | null
  /** The gift's dynamic link from isla-app's /admin/gifts, printed in the QR exactly as given. */
  qrUrl?: string
  logoMode: LogoMode
  /** Edited letter text; anything missing falls back to the default for the map's language. */
  letter?: Partial<LetterText>
  status: Status
  notes: string
  createdAt: number
  updatedAt: number
}

/** What the renderer needs; derived from a Client. */
export interface MapData {
  lang: Lang
  company: string
  stages: string[]
  stageNotes: string[]
  start: string
  dangers: Dangers
  /** Last plaque and the subtitle ("The path to …"). */
  destination: string
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
