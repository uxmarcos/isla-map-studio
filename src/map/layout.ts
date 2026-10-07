// Template specs: artwork plus where each piece of text goes, in that artwork's own pixels.
// Calibrated against each image; change here if a template changes.
// The artwork is 3:2; the printed map is A4 landscape, so toA4() stretches the artwork's height
// (about 6%, keeping its frame whole) and moves every slot with it. Text, logos and the QR are not stretched.
import type { MapStyle } from '../types'

const SERIF = '"Libre Baskerville", "Times New Roman", serif'
const SANS = '"Jost", "Futura", sans-serif'

export interface TextSlot { cx: number; baseline: number; maxW: number; size: number; minSize: number; tracking: number }
/** A plaque's outer size and the room for text inside it. */
export interface Plaque { cx: number; cy: number; w: number; h: number; innerW: number; innerH: number }

export interface TemplateSpec {
  src: string
  /** Canvas size: the artwork's width, A4 height. */
  w: number
  h: number
  /** Text and single-colour logo. */
  ink: string
  /** Shown while the artwork loads. */
  paper: string
  fonts: { title: string; subtitle: string; plaque: string; url: string }
  title: { cx: number; maxW: number; line1Baseline: number; line2Baseline: number; size: number; minSize: number; tracking: number }
  /** Long goals wrap to a second line instead of going below minSize. */
  subtitle: TextSlot
  /** Above the title, where the artwork had a star: Isla mark | rule | client logo, as on the letter. */
  header: { cx: number; cy: number; markH: number; gap: number; ruleH: number; logoMaxW: number; logoMaxH: number }
  plaques: Plaque[]
  /** minSize is the smallest readable print size; longer text grows the plaque instead of shrinking. */
  plaqueText: { size: number; minSize: number; tracking: number }
  /**
   * Drawn over the artwork's plaque when the text needs a bigger one. art: stretch the artwork's own
   * plaque instead (textured parchment a flat fill can't match); shape and fill still style the small tags.
   */
  plaqueFrame: {
    shape: 'octagon' | 'rounded'
    corner: number
    fill: string
    stroke: string
    art?: boolean
    /** The artwork has no plaques: draw a frame for every one. */
    always?: boolean
    /** Shape of the small tags (notes, dangers, "you are here") when it differs from the plaques. */
    tagShape?: 'octagon' | 'rounded'
    /** Drop shadow and darker edges, to sit on painted art like old parchment. */
    aged?: boolean
  }
  /** Italic line under each stage plaque: what Isla does there. Size is the readable print size. */
  note: { size: number; maxW: number; gap: number }
  /** Isla mark in a medallion at the centre of the compass: "you sail with Isla". */
  compass: { cx: number; cy: number; r: number }
  /** What Isla protects the client from: a label under the kraken, and a whirlpool drawn on the open sea with its label. */
  dangers: {
    kraken: { cx: number; cy: number }
    /** depth: shadow colours for the throat and the mid wall of the funnel. baked: the artwork already has one (only its label is drawn). */
    whirlpool: { cx: number; cy: number; r: number; ink: string; foam: string; depth: [string, string]; baked?: boolean }
    size: number
    maxW: number
  }
  /** "You are here" tag on the first island; dot is where the route starts (null: no connector). */
  start: { cx: number; cy: number; maxW: number; size: number; dot: { x: number; y: number } | null }
  /** Octagonal frame around the QR (frameInArt: the artwork has it). The QR itself always prints dark on light so every phone reads it. */
  qr: { cx: number; cy: number; frame: number; chamfer: number; fill: string; stroke: string; panel: string; module: string; frameInArt?: boolean }
  url: TextSlot
  /** Tag just under the QR, centred on it: NFC icon beside "or hold your phone to the logo on the chest". gap: from the QR frame; maxW: the text's width. */
  nfc: { gap: number; maxW: number; size: number }
  /** Drawn when the artwork has no ornament of its own: line ◇ line under the title, rules beside the URL. */
  titleRule?: { cx: number; y: number; half: number }
  urlRules?: { gap: number; length: number }
}

const white: TemplateSpec = {
  src: '/template-white.png',
  w: 4344,
  h: 2896,
  ink: '#161616',
  paper: '#E5E4DF',
  fonts: { title: `700 {s}px ${SERIF}`, subtitle: `400 {s}px ${SANS}`, plaque: `700 {s}px ${SERIF}`, url: `400 {s}px ${SANS}` },
  title: { cx: 885, maxW: 1240, line1Baseline: 445, line2Baseline: 575, size: 118, minSize: 76, tracking: 0.035 },
  subtitle: { cx: 885, baseline: 762, maxW: 1240, size: 64, minSize: 40, tracking: 0.3 },
  header: { cx: 885, cy: 230, markH: 112, gap: 56, ruleH: 150, logoMaxW: 440, logoMaxH: 112 },
  plaques: [
    { cx: 633, cy: 2244, w: 462 },
    { cx: 1151, cy: 1955, w: 412 },
    { cx: 1741, cy: 1759, w: 410 },
    { cx: 2298, cy: 1465, w: 373 },
    { cx: 3093, cy: 1188, w: 452 },
    { cx: 3868, cy: 840, w: 440 },
  ].map((p) => ({ ...p, h: 124, innerW: p.w - 76, innerH: 84 })),
  plaqueText: { size: 38, minSize: 30, tracking: 0.06 },
  plaqueFrame: { shape: 'octagon', corner: 24, fill: '#E9E8E3', stroke: '#161616' },
  note: { size: 32, maxW: 520, gap: 14 },
  compass: { cx: 3903, cy: 2295, r: 74 },
  dangers: {
    kraken: { cx: 3092, cy: 2560 },
    // Where a mountain islet was erased from the artwork (scripts/clean-template.mjs).
    whirlpool: { cx: 1444, cy: 1035, r: 175, ink: '#161616', foam: '#FFFFFF', depth: ['rgba(20,20,20,0.72)', 'rgba(20,20,20,0.13)'] },
    size: 30,
    maxW: 620,
  },
  start: { cx: 390, cy: 2070, maxW: 460, size: 36, dot: { x: 680, y: 2070 } },
  qr: { cx: 2183, cy: 2262, frame: 370, chamfer: 34, fill: '#E5E4DF', stroke: '#161616', panel: '#E5E4DF', module: '#161616' },
  url: { cx: 2172, baseline: 2675, maxW: 1150, size: 56, minSize: 34, tracking: 0.26 },
  nfc: { gap: 18, maxW: 440, size: 28 },
}

// Same artwork as white, inverted by scripts/clean-template.mjs, so the layout is shared.
const dark: TemplateSpec = {
  ...white,
  src: '/template-dark.png',
  ink: '#F5F5F2',
  paper: '#141414',
  plaqueFrame: { ...white.plaqueFrame, fill: '#121212', stroke: '#F5F5F2' },
  dangers: {
    ...white.dangers,
    whirlpool: { ...white.dangers.whirlpool, ink: '#F5F5F2', foam: '#F5F5F2', depth: ['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.45)'] },
  },
  qr: { ...white.qr, fill: '#141414', stroke: '#F5F5F2', panel: '#F5F5F2', module: '#0A0A0A' },
}

// Soft watercolour map, already A4 (scripts/make-color-template.mjs). The artwork is clean: plaques,
// notes, the QR frame and the ornaments are drawn here, in the places the reference design put them.
// Its whirlpool is part of the art.
const color: TemplateSpec = {
  src: '/template-color.jpg',
  w: 4344,
  h: 3072,
  ink: '#2A251E',
  paper: '#E0D3B5',
  fonts: { title: `400 {s}px ${SERIF}`, subtitle: `400 {s}px ${SERIF}`, plaque: `400 {s}px ${SERIF}`, url: `400 {s}px ${SANS}` },
  title: { cx: 922, maxW: 1340, line1Baseline: 446, line2Baseline: 574, size: 128, minSize: 80, tracking: 0.03 },
  subtitle: { cx: 914, baseline: 763, maxW: 1180, size: 76, minSize: 44, tracking: 0.17 },
  titleRule: { cx: 914, y: 644, half: 648 },
  header: { cx: 802, cy: 220, markH: 120, gap: 56, ruleH: 152, logoMaxW: 380, logoMaxH: 116 },
  plaques: [
    { cx: 671, cy: 2404, w: 456, h: 186 },
    { cx: 1178, cy: 2037, w: 410, h: 150 },
    { cx: 1818, cy: 1858, w: 385, h: 140 },
    { cx: 2345, cy: 1540, w: 407, h: 139 },
    { cx: 3079, cy: 1227, w: 407, h: 136 },
    { cx: 3824, cy: 870, w: 452, h: 163 },
  ].map((p) => ({ ...p, innerW: p.w - 70, innerH: p.h - 48 })),
  plaqueText: { size: 56, minSize: 36, tracking: 0.03 },
  plaqueFrame: { shape: 'octagon', corner: 26, fill: '#E5D2AD', stroke: '#3B3426', always: true, tagShape: 'rounded', aged: true },
  note: { size: 37, maxW: 600, gap: 8 },
  compass: { cx: 3928, cy: 2386, r: 58 },
  dangers: {
    kraken: { cx: 3110, cy: 2745 },
    whirlpool: { cx: 1522, cy: 1088, r: 200, ink: '#42666B', foam: '#F4EEDF', depth: ['rgba(6,28,34,0.8)', 'rgba(10,50,60,0.2)'], baked: true },
    size: 30,
    maxW: 620,
  },
  start: { cx: 390, cy: 2196, maxW: 460, size: 36, dot: null },
  qr: { cx: 2176, cy: 2435, frame: 388, chamfer: 32, fill: '#EBDDBE', stroke: '#3B3426', panel: '#EBDDBE', module: '#221F1D' },
  url: { cx: 2175, baseline: 2838, maxW: 1180, size: 60, minSize: 36, tracking: 0.22 },
  nfc: { gap: 20, maxW: 440, size: 28 },
  urlRules: { gap: 66, length: 174 },
}

/** Stretches a 3:2 spec to A4 landscape: every vertical position (and plaque height) scales by the same factor. */
function toA4(t: TemplateSpec): TemplateSpec {
  const h = Math.round(t.w / Math.SQRT2)
  const sy = h / t.h
  const y = (v: number) => Math.round(v * sy)
  return {
    ...t,
    h,
    title: { ...t.title, line1Baseline: y(t.title.line1Baseline), line2Baseline: y(t.title.line2Baseline) },
    subtitle: { ...t.subtitle, baseline: y(t.subtitle.baseline) },
    header: { ...t.header, cy: y(t.header.cy) },
    plaques: t.plaques.map((p) => ({ ...p, cy: y(p.cy), h: y(p.h), innerH: y(p.innerH) })),
    compass: { ...t.compass, cy: y(t.compass.cy) },
    dangers: {
      ...t.dangers,
      kraken: { ...t.dangers.kraken, cy: y(t.dangers.kraken.cy) },
      whirlpool: { ...t.dangers.whirlpool, cy: y(t.dangers.whirlpool.cy) },
    },
    start: { ...t.start, cy: y(t.start.cy), dot: t.start.dot && { ...t.start.dot, y: y(t.start.dot.y) } },
    qr: { ...t.qr, cy: y(t.qr.cy) },
    url: { ...t.url, baseline: y(t.url.baseline) },
  }
}

export const TEMPLATES: Record<MapStyle, TemplateSpec> = { white: toA4(white), dark: toA4(dark), color: toA4(color) }
