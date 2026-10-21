import QRCode from 'qrcode'
import rough from 'roughjs'
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { Options } from 'roughjs/bin/core'
import type { Kind, Lang, LetterText, MapStyle } from '../types'
import { loadImage } from '../map/logo'
import { MARK_PATH, MARK_VIEWBOX } from '../map/islaMark'
import { fillVars, PIPELINE } from './copy'
import { qrLabel } from '../qr'

const SERIF = '"Libre Baskerville", "Times New Roman", serif'
/** Body text on the map's letter; its headings use the serif above. */
const SANS = '"Manrope", "Inter", ui-sans-serif, sans-serif'

// Isla's own two faces, read off isla.to: the display serif at regular weight over near-black, and
// Inter Tight for everything else. The coin's letter is the printed side of that same brand, so it
// borrows both. Instrument Serif ships one weight, which is why the heading weight is a field.
const DISPLAY = '"Instrument Serif", "Times New Roman", serif'
const UI = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'

/** A4 portrait at 300 dpi. */
export const LETTER_W = 2480
export const LETTER_H = 3508

interface LetterSpec {
  src: string
  /** Display face for the title, the goal line, the step numbers and the sign-off. */
  head: string
  /** Weight for that face: Instrument Serif has only one, and a synthesised bold is not a weight. */
  headW: string
  /** Everything else: paragraphs, captions, the small caps. */
  body: string
  paper: string
  ink: string
  /** Body text: a touch softer than the headings. */
  soft: string
  /** Hand-drawn fills (hachure) in the step illustrations. */
  accent: string
  accent2: string
  qrPanel: string
  qrModule: string
}

export const LETTER_SPECS: Record<MapStyle, LetterSpec> = {
  white: {
    src: '/letter-white.jpg', head: SERIF, headW: '700', body: SANS, paper: '#E6E5E0', ink: '#161616', soft: '#2E2E2C',
    accent: 'rgba(22,22,22,0.55)', accent2: 'rgba(22,22,22,0.8)', qrPanel: '#E6E5E0', qrModule: '#161616',
  },
  dark: {
    src: '/letter-dark.jpg', head: SERIF, headW: '700', body: SANS, paper: '#141414', ink: '#F5F5F2', soft: '#D9D9D4',
    accent: 'rgba(245,245,242,0.5)', accent2: 'rgba(245,245,242,0.8)', qrPanel: '#F5F5F2', qrModule: '#0A0A0A',
  },
  // Matches the colour map: light parchment, its dark ink, the sea's teal and the roofs' terracotta.
  color: {
    src: '/letter-color.jpg', head: SERIF, headW: '700', body: SANS, paper: '#E7D8BA', ink: '#2A251E', soft: '#463E33',
    accent: 'rgba(72,128,138,0.7)', accent2: 'rgba(168,86,56,0.72)', qrPanel: '#EFE3C8', qrModule: '#221F1D',
  },
}

// The coin's own paper: flat black and white, no parchment and no compass roses, so the piece
// stops reading as a page torn out of the treasure map.
const COIN_WHITE: LetterSpec = {
  src: '/letter-coin-white.jpg', head: DISPLAY, headW: '400', body: UI, paper: '#F6F6F4', ink: '#111111', soft: '#3A3A38',
  accent: 'rgba(17,17,17,0.5)', accent2: 'rgba(17,17,17,0.78)', qrPanel: '#F6F6F4', qrModule: '#111111',
}
const COIN_DARK: LetterSpec = {
  src: '/letter-coin-dark.jpg', head: DISPLAY, headW: '400', body: UI, paper: '#0A0A0A', ink: '#F5F5F2', soft: '#CFCFCB',
  accent: 'rgba(245,245,242,0.45)', accent2: 'rgba(245,245,242,0.78)', qrPanel: '#F5F5F2', qrModule: '#0A0A0A',
}
/** The coin keeps the map's three slots so nothing else needs a special case; colour is the light sheet. */
const COIN_SPECS: Record<MapStyle, LetterSpec> = { white: COIN_WHITE, dark: COIN_DARK, color: COIN_WHITE }

/** Paper and inks for a letter: the coin track has its own. */
export const letterSpec = (kind: Kind, style: MapStyle) => (kind === 'coin' ? COIN_SPECS : LETTER_SPECS)[style]

let fontsPromise: Promise<unknown> | null = null
export const loadLetterFonts = () =>
  (fontsPromise ??= Promise.all(
    [
      '400 40px "Manrope"', '500 40px "Manrope"', '600 40px "Manrope"', '700 40px "Manrope"',
      '700 40px "Libre Baskerville"', 'italic 400 40px "Libre Baskerville"',
      // The coin's letter: Isla's display serif (one weight, plus its italic) and Inter Tight.
      '400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"',
      '400 40px "Inter Tight"', '500 40px "Inter Tight"', '600 40px "Inter Tight"', '700 40px "Inter Tight"',
    ].map((f) =>
      document.fonts.load(f),
    ),
  ))

const papers = new Map<string, Promise<HTMLImageElement>>()
export const loadPaper = (kind: Kind, style: MapStyle) => {
  const { src } = letterSpec(kind, style)
  if (!papers.has(src)) papers.set(src, loadImage(src))
  return papers.get(src)!
}

export interface LetterData {
  /** Which track this letter belongs to: it decides the goal line and the footer's hierarchy. */
  kind: Kind
  lang: Lang
  /** Client logo, already processed for this style (null: company name is written instead). */
  logo: HTMLCanvasElement | null
  text: LetterText
  company: string
  goal: string
  /** Empty draws a "QR pending" placeholder (exports are blocked until it is set). */
  qrUrl: string
}

type Ctx = CanvasRenderingContext2D

const M = 250 // page margin
const CONTENT_W = LETTER_W - M * 2

/**
 * Every rough.js stroke, drawn precisely. roughness 0 and bowing 0 keep each shape exactly where
 * it is and only take the tremble out, so the six step illustrations survive the change intact —
 * the alternative was redrawing all of them. Options are always rough.js's last argument.
 */
function straight(rc: RoughCanvas): RoughCanvas {
  const flat = (o: Options = {}): Options => ({ ...o, roughness: 0, bowing: 0, preserveVertices: true })
  return new Proxy(rc, {
    get(target, prop, receiver) {
      const fn = Reflect.get(target, prop, receiver)
      if (typeof fn !== 'function') return fn
      return (...args: unknown[]) => {
        const last = args[args.length - 1]
        const hasOptions = typeof last === 'object' && last !== null && !Array.isArray(last)
        return fn.apply(target, hasOptions ? [...args.slice(0, -1), flat(last as Options)] : [...args, flat()])
      }
    },
  })
}

/** Draws the full letter onto a canvas of any size, laid out in A4 pixels at 300 dpi. */
export function drawLetter(canvas: HTMLCanvasElement, style: MapStyle, paper: HTMLImageElement, d: LetterData) {
  const coin = d.kind === 'coin'
  // Faces come from the spec: the map's letter keeps its book serif, the coin's uses Isla's own.
  const t = letterSpec(d.kind, style)
  const ctx = canvas.getContext('2d')!
  const k = canvas.width / LETTER_W
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(paper, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.textBaseline = 'alphabetic'
  const rc = coin ? straight(rough.canvas(canvas)) : rough.canvas(canvas)
  const v = (s: string) => fillVars(s, d.company.trim() || 'Company', d.goal.trim() || '…')

  // Header: Isla | client, a partnership line. Then the eyebrow.
  const headCy = 300
  const sideGap = 70
  const markW = 150
  const ks = markW / MARK_VIEWBOX.w
  const markH = MARK_VIEWBOX.h * ks
  ctx.save()
  ctx.translate(LETTER_W / 2 - sideGap - markW, headCy - markH / 2)
  ctx.scale(ks, ks)
  ctx.fillStyle = t.ink
  ctx.fill(new Path2D(MARK_PATH), 'evenodd')
  ctx.restore()
  rc.line(LETTER_W / 2, headCy - 95, LETTER_W / 2, headCy + 95, { stroke: t.ink, strokeWidth: 3.5, roughness: 1.2, seed: 9 })
  if (d.logo) {
    const s = Math.min(560 / d.logo.width, 150 / d.logo.height)
    const lw = d.logo.width * s, lh = d.logo.height * s
    ctx.drawImage(d.logo, LETTER_W / 2 + sideGap, headCy - lh / 2, lw, lh)
  } else {
    ctx.textBaseline = 'middle'
    let fs = 64
    ctx.font = `${t.headW} ${fs}px ${t.head}`
    while (fs > 36 && ctx.measureText(d.company).width > 620) ctx.font = `${t.headW} ${(fs -= 2)}px ${t.head}`
    text(ctx, d.company.trim() || 'Company', LETTER_W / 2 + sideGap, headCy, `${t.headW} ${fs}px ${t.head}`, t.ink, 'left', 0)
    ctx.textBaseline = 'alphabetic'
  }
  let y = headCy + 200
  text(ctx, v(d.text.eyebrow).toLocaleUpperCase('pt-BR'), LETTER_W / 2, y, `600 32px ${t.body}`, t.soft, 'center', 0.28)

  // Title, up to two lines, shrinking if needed. *Asterisks* set a phrase in italic and put it on
  // its own line: the roman-then-italic pair Isla's hero and the gift page are both built on.
  // Tracking matches the site's display setting, which is tight.
  y += 140
  const title = v(d.text.title)
  const emphasis = title.match(/^(.*?)\s*\*([^*]+)\*(.*)$/)
  const tracking = coin ? -0.025 : 0
  let size = 104
  let lines: { s: string; italic: boolean }[] = []
  for (; size >= 64; size -= 4) {
    const font = (italic: boolean) => `${italic ? 'italic ' : ''}${t.headW} ${size}px ${t.head}`
    lines = emphasis
      ? [
          ...wrap(ctx, emphasis[1], font(false), CONTENT_W, tracking).map((s) => ({ s, italic: false })),
          ...wrap(ctx, `${emphasis[2]}${emphasis[3]}`, font(true), CONTENT_W, tracking).map((s) => ({ s, italic: true })),
        ].filter((l) => l.s)
      : wrap(ctx, title, font(false), CONTENT_W, tracking).map((s) => ({ s, italic: false }))
    if (lines.length <= 2) break
  }
  for (const line of lines) {
    text(ctx, line.s, LETTER_W / 2, y, `${line.italic ? 'italic ' : ''}${t.headW} ${size}px ${t.head}`, t.ink, 'center', tracking)
    y += size * 1.1
  }

  // Ornament: line, diamond, line. The coin gets a plain hairline instead.
  y += 10
  divider(ctx, t, y, coin)
  y += 120

  // Intro paragraph.
  y = paragraph(ctx, v(d.text.intro), y, `400 42px ${t.body}`, 42 * 1.65, t.soft)

  // How it works.
  y += 110
  text(ctx, v(d.text.howTitle), LETTER_W / 2, y, `${t.headW} 60px ${t.head}`, t.ink, 'center', 0)
  ctx.font = `${t.headW} 60px ${t.head}`
  ctx.letterSpacing = '0px'
  const hw = ctx.measureText(v(d.text.howTitle)).width
  if (coin) {
    // A rule under the title, exactly its width: the hand-drawn swoosh with the tremble removed
    // would still wander, because its control points are at four different heights.
    ctx.strokeStyle = t.ink
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(LETTER_W / 2 - hw / 2, y + 36)
    ctx.lineTo(LETTER_W / 2 + hw / 2, y + 36)
    ctx.stroke()
  } else {
    rc.curve(
      [[LETTER_W / 2 - hw / 2 - 20, y + 34], [LETTER_W / 2 - hw / 6, y + 44], [LETTER_W / 2 + hw / 4, y + 30], [LETTER_W / 2 + hw / 2 + 20, y + 40]],
      { stroke: t.ink, strokeWidth: 3.5, roughness: 1.2, seed: 41 },
    )
  }
  y += 105

  // The goal line, measured before the cards so it comes out of the page's budget the way the
  // closing does. The six steps explain Isla and must stay whole, so nothing else may eat them.
  const goal = goalBlock(ctx, d.text.goalLine ? v(d.text.goalLine) : '', t)

  // Six hand-drawn step cards, three per row. The footer (QR) is pinned to the bottom,
  // so a long title or intro makes the cards a little shorter instead of overflowing.
  const gap = 60
  const cardW = (CONTENT_W - gap * 2) / 3
  const closingH = wrap(ctx, v(d.text.closing), `400 42px ${t.body}`, CONTENT_W - 80, 0).length * 42 * 1.65
  const FOOTER_TOP = LETTER_H - M - 340 - 40
  // Clearance between the closing and the footer's ink. The coin needs far more than the map: its
  // block is taller (the tag's waves rise above the disc, the caption runs to two lines) and it
  // hangs lower. Without it the cards clamp at their floor and the closing runs into the coin.
  const clear = d.kind === 'coin' ? 250 : 60
  // The floor is what the cards may not go below and still read. The coin's cards carry no
  // hand-drawn frame padding, so they take a lower one — and the lower floor is what keeps the
  // closing off the QR when the title runs to two lines.
  const floor = d.kind === 'coin' ? 470 : 540
  const cardH = Math.max(floor, Math.min(620, (FOOTER_TOP - clear - closingH - goal.h - 130 - y - gap) / 2))
  d.text.steps.slice(0, 6).forEach((step, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    stepCard(ctx, rc, t, d.lang, i, v(step.title), v(step.text), M + col * (cardW + gap), y + row * (cardH + gap), cardW, cardH)
  })
  y += cardH * 2 + gap + 130

  // The goal, where the map puts its X: at the end of the route the six steps just described.
  if (goal.lines.length) {
    y += GOAL_LEAD
    divider(ctx, t, y, coin)
    y += GOAL_AFTER
    for (const line of goal.lines) {
      text(ctx, line, LETTER_W / 2, y, `${t.headW} ${goal.size}px ${t.head}`, t.ink, 'center', 0)
      y += goal.size * 1.2
    }
    y += GOAL_TAIL
  }

  // Closing paragraph.
  y = paragraph(ctx, v(d.text.closing), y, `400 42px ${t.body}`, 42 * 1.65, t.soft)

  // Footer: sign-off on the left, the way into the gift on the right, anchored to the bottom margin.
  let sy = FOOTER_TOP + 120
  // Both display faces ship a real italic, so the sign-off keeps it on either track.
  for (const line of v(d.text.signoff).split('\n')) {
    text(ctx, line, M, sy, `italic ${t.headW} 50px ${t.head}`, t.ink, 'left', 0)
    sy += 50 * 1.5
  }
  if (d.kind === 'coin') coinFooter(ctx, rc, t, d, v)
  else mapFooter(ctx, rc, t, d, v, FOOTER_TOP)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Space around the goal line: before its divider, divider to first baseline, and after it. */
const GOAL_LEAD = 24
const GOAL_AFTER = 78
const GOAL_TAIL = 46

/** The goal line's size, lines and the room it needs. Empty (the map's letter) costs nothing. */
function goalBlock(ctx: Ctx, line: string, t: LetterSpec) {
  if (!line.trim()) return { lines: [] as string[], size: 0, h: 0 }
  let size = 58
  let lines = wrap(ctx, line, `${t.headW} ${size}px ${t.head}`, CONTENT_W - 220, 0)
  while (size > 40 && lines.length > 2) lines = wrap(ctx, line, `${t.headW} ${(size -= 4)}px ${t.head}`, CONTENT_W - 220, 0)
  return { lines, size, h: GOAL_LEAD + GOAL_AFTER + lines.length * size * 1.2 + GOAL_TAIL }
}

/** The caption under a QR: what it opens, and the link itself once it is valid. */
function qrCaption(ctx: Ctx, t: LetterSpec, caption: string, url: string, cx: number, bottom: number, quiet = false) {
  const label = qrLabel(url)
  text(ctx, caption.toLocaleUpperCase('pt-BR'), cx, bottom + (label ? 58 : 64), `700 ${quiet ? 22 : 24}px ${t.body}`, quiet ? t.soft : t.ink, 'center', 0.2)
  if (label) text(ctx, label.toUpperCase(), cx, bottom + 98, `500 ${quiet ? 21 : 23}px ${t.body}`, t.soft, 'center', 0.14)
}

/** The map's footer: the QR leads to the gift, and the chest's NFC logo is the shortcut beside it. */
function mapFooter(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, d: LetterData, v: (s: string) => string, top: number) {
  const size = 340
  const x = LETTER_W - M - size
  qr(ctx, rc, t, d.qrUrl, x, top, size)
  nfcNote(ctx, rc, t, v(d.text.nfcCaption), x - 110, top, size)
  qrCaption(ctx, t, v(d.text.qrCaption), d.qrUrl, x + size / 2, top + size)
}

/**
 * The coin's footer, the map's inverted. The coin is what the case holds and tapping it is the
 * whole gesture, so it takes the slot and the weight the QR carries on the map, with its caption
 * in the same caps the map gives the QR. The QR stays beside it, smaller and quieter: the way in
 * for a phone that will not read the tag: at 250px it still prints about 21 mm, and the tighter
 * quiet zone keeps its modules near the ones on the map's bigger code.
 */
function coinFooter(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, d: LetterData, v: (s: string) => string) {
  // A column ending at the right margin, like the map's nfcNote, holding the coin and its caption.
  const colW = 440
  const right = LETTER_W - M
  const cx = right - colW / 2
  const coin = 280
  const lines = wrap(ctx, v(d.text.nfcCaption).toLocaleUpperCase('pt-BR'), `700 26px ${t.body}`, colW, 0.16).slice(0, 2)
  // Anchored to the foot of the page rather than hung off the sign-off's line: the block sits well
  // below the closing, and its caption ends where the map's gift link does.
  const lastBaseline = LETTER_H - 225
  const discBottom = lastBaseline - (lines.length - 1) * 26 * 1.5 - 64
  const cy = discBottom - coin / 2
  coinTag(ctx, rc, t, cx, cy, coin)
  // Isla's address, on the page's own axis between the sign-off and the gift, and on the footer's
  // optical line. It is a mark, not an instruction, so it echoes the map's url: light, wide caps.
  if (d.text.site) text(ctx, v(d.text.site).toLocaleUpperCase('pt-BR'), LETTER_W / 2, cy, `400 30px ${t.body}`, t.ink, 'center', 0.24)
  // The caption sits under the disc, not under the drawing's centre: the disc is the object the
  // eye reads, and the waves hanging off its right would pull the words out of line with it.
  const discX = cx - coin * COIN_DISC_SHIFT
  let ty = discBottom + 64
  for (const line of lines) {
    text(ctx, line, discX, ty, `700 26px ${t.body}`, t.ink, 'center', 0.16)
    ty += 26 * 1.5
  }
  const qrSize = 250
  const qrX = right - colW - 110 - qrSize
  qr(ctx, rc, t, d.qrUrl, qrX, cy - qrSize / 2, qrSize, 20)
  qrCaption(ctx, t, v(d.text.qrCaption), d.qrUrl, qrX + qrSize / 2, cy + qrSize / 2, true)
}

/**
 * The waves reach 0.86 size to the right of the disc and nothing to its left, so the disc sits
 * this much left of the whole drawing's centre for it to balance in its column.
 */
const COIN_DISC_SHIFT = 0.18

/**
 * The coin: the Isla mark struck on a rimmed disc, with the tag's waves off its right edge.
 * (cx, cy) is the centre of the whole drawing, waves included, so it centres in its column;
 * `size` is the disc's diameter.
 */
function coinTag(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, cx: number, cy: number, size: number) {
  const o: Options = { stroke: t.ink, strokeWidth: 5, roughness: 1.1, bowing: 0.9, seed: 88 }
  const x = cx - size * COIN_DISC_SHIFT
  // The spotlight the coin sits in on the gift page, printed: a soft halo behind the disc. It is
  // the one place this sheet is not flat, and it only reads on the near-black paper.
  const halo = ctx.createRadialGradient(x, cy, size * 0.3, x, cy, size * 0.95)
  halo.addColorStop(0, `${t.ink}1f`)
  halo.addColorStop(1, `${t.ink}00`)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, cy, size * 0.95, 0, Math.PI * 2)
  ctx.fill()
  rc.circle(x, cy, size, o)
  // A thin rim, so the mark fills the face the way a struck coin's device does.
  rc.circle(x, cy, size * 0.86, { ...o, strokeWidth: 2.4, seed: 89 })
  // Milled edge: the reeding around a struck coin, and the detail that makes it read as metal
  // rather than as a drawn circle. 72 ticks is dense enough to print as texture at 300 dpi.
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const r0 = size * 0.5, r1 = size * 0.465
    ctx.moveTo(x + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    ctx.lineTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1)
  }
  ctx.stroke()
  const mw = size * 0.54
  const ks = mw / MARK_VIEWBOX.w
  ctx.save()
  ctx.translate(x - mw / 2, cy - (MARK_VIEWBOX.h * ks) / 2)
  ctx.scale(ks, ks)
  ctx.fillStyle = t.ink
  ctx.fill(new Path2D(MARK_PATH), 'evenodd')
  ctx.restore()
  ;[0.62, 0.74, 0.86].forEach((k, i) => {
    const d = size * k * 2
    rc.arc(x, cy, d, d, -Math.PI * 0.22, Math.PI * 0.22, false, { ...o, strokeWidth: 3, seed: 91 + i })
  })
}

function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign, tracking: number) {
  ctx.font = font
  const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)![1])
  ctx.letterSpacing = `${size * tracking}px`
  ctx.fillStyle = color
  ctx.textAlign = align
  // Canvas adds tracking after the last glyph too; recentre.
  ctx.fillText(s, align === 'center' ? x + (size * tracking) / 2 : x, y)
}

/** Greedy word wrap that respects explicit line breaks. */
function wrap(ctx: Ctx, s: string, font: string, maxW: number, tracking: number): string[] {
  ctx.font = font
  const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)![1])
  ctx.letterSpacing = `${size * tracking}px`
  const out: string[] = []
  for (const para of s.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line)
        line = word
      } else line = test
    }
    out.push(line)
  }
  return out
}

/** Left-aligned paragraph in a centred column; returns the y after it. */
function paragraph(ctx: Ctx, s: string, y: number, font: string, lh: number, color: string) {
  const colW = CONTENT_W - 80
  const x = (LETTER_W - colW) / 2
  for (const line of wrap(ctx, s, font, colW, 0)) {
    text(ctx, line, x, y, font, color, 'left', 0)
    y += lh
  }
  return y
}

/** plain: one hairline, no diamond — the coin's rule. */
function divider(ctx: Ctx, t: LetterSpec, y: number, plain = false) {
  const half = 420
  const cx = LETTER_W / 2
  ctx.strokeStyle = t.ink
  ctx.lineWidth = plain ? 2 : 3
  if (plain) {
    ctx.beginPath()
    ctx.moveTo(cx - half, y)
    ctx.lineTo(cx + half, y)
    ctx.stroke()
    return
  }
  ctx.beginPath()
  ctx.moveTo(cx - half, y)
  ctx.lineTo(cx - 30, y)
  ctx.moveTo(cx + 30, y)
  ctx.lineTo(cx + half, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, y - 14)
  ctx.lineTo(cx + 14, y)
  ctx.lineTo(cx, y + 14)
  ctx.lineTo(cx - 14, y)
  ctx.closePath()
  ctx.lineWidth = 3
  ctx.stroke()
}

function stepCard(
  ctx: Ctx, rc: RoughCanvas, t: LetterSpec, lang: Lang, i: number, title: string, body: string,
  x: number, y: number, w: number, h: number,
) {
  const base: Options = { stroke: t.ink, strokeWidth: 3.5, roughness: 1.5, bowing: 1.4, seed: 100 + i * 7 }
  rc.rectangle(x, y, w, h, base)

  // Number in a circle, top-left (hand-drawn on the map's letter, struck on the coin's).
  rc.circle(x + 62, y + 62, 72, { ...base, strokeWidth: 3, seed: 200 + i })
  text(ctx, String(i + 1), x + 62, y + 77, `${t.headW} 40px ${t.head}`, t.ink, 'center', 0)

  const squeeze = 620 - h
  // Kept clear of the number circle in the corner.
  illustration(ctx, rc, t, lang, i, x + w / 2 + 20, y + 225 - squeeze * 0.4, w - 170, 240 - squeeze * 0.35)

  let ty = y + 405 - squeeze * 0.55
  const tLines = wrap(ctx, title.toLocaleUpperCase('pt-BR'), `${t.headW} 31px ${t.head}`, w - 70, 0.04)
  for (const line of tLines.slice(0, 2)) {
    text(ctx, line, x + w / 2, ty, `${t.headW} 31px ${t.head}`, t.ink, 'center', 0.04)
    ty += 31 * 1.3
  }
  ty += 16
  for (const line of wrap(ctx, body, `400 27px ${t.body}`, w - 80, 0).slice(0, 4)) {
    text(ctx, line, x + w / 2, ty, `400 27px ${t.body}`, t.soft, 'center', 0)
    ty += 27 * 1.5
  }
}

/**
 * The six step illustrations, in the spirit of the landing page's product mocks
 * (profile cards, the lead board, a LinkedIn post, the Approve key, a booked call),
 * drawn by hand with rough.js in a w x h box centred on (cx, cy).
 */
function illustration(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, lang: Lang, i: number, cx: number, cy: number, w: number, h: number) {
  const X = (f: number) => cx + (f * w) / 2
  const Y = (f: number) => cy + (f * h) / 2
  const seed = 300 + i * 13
  const ln: Options = { stroke: t.ink, strokeWidth: 3, roughness: 1.3, bowing: 1.1, seed }
  const thin: Options = { ...ln, strokeWidth: 2.2 }
  const hatchA: Options = { ...ln, fill: t.accent, fillStyle: 'hachure', hachureGap: 11, hachureAngle: -41, fillWeight: 2 }
  const hatchB: Options = { ...hatchA, fill: t.accent2, hachureAngle: 50 }
  const solid: Options = { ...ln, fill: t.ink, fillStyle: 'solid' }
  const label = (s: string, x: number, y: number, size: number, weight = 700, color = t.ink) =>
    text(ctx, s, x, y, `${weight} ${size}px ${t.body}`, color, 'center', 0)
  /** A small profile card: avatar and two text lines. */
  const profile = (x: number, y: number, cw: number, ch: number, o: Options, k: number) => {
    rc.rectangle(x, y, cw, ch, { ...o, seed: seed + k })
    rc.circle(x + ch / 2, y + ch / 2, ch * 0.56, { ...thin, seed: seed + k + 1 })
    rc.line(x + ch * 0.95, y + ch * 0.38, x + cw - 16, y + ch * 0.38, { ...thin, seed: seed + k + 2 })
    rc.line(x + ch * 0.95, y + ch * 0.64, x + cw * 0.62, y + ch * 0.64, { ...thin, seed: seed + k + 3 })
  }
  const pill = (x: number, y: number, pw: number, ph: number, s: string, fill: string | null, k: number) => {
    rc.rectangle(x, y, pw, ph, fill ? { ...ln, fill, fillStyle: 'solid', seed: seed + k } : { ...ln, seed: seed + k })
    label(s, x + pw / 2, y + ph * 0.68, ph * 0.5, 700, fill ? t.paper : t.ink)
  }
  const pt = lang === 'pt'

  switch (i) {
    case 0: {
      // A LinkedIn post in your voice, with the Approve key below.
      const pw = w * 0.78, ph = h * 0.66
      const x0 = X(-0.78), y0 = Y(-0.95)
      rc.rectangle(x0, y0, pw, ph, { ...ln, seed })
      rc.circle(x0 + 34, y0 + 32, 36, hatchA)
      rc.line(x0 + 62, y0 + 26, x0 + pw * 0.55, y0 + 26, { ...thin, seed: seed + 1 })
      rc.line(x0 + 62, y0 + 42, x0 + pw * 0.38, y0 + 42, { ...thin, seed: seed + 2 })
      for (let k = 0; k < 3; k++) rc.line(x0 + 18, y0 + 72 + k * 18, x0 + pw - (k === 2 ? pw * 0.4 : 18), y0 + 72 + k * 18, { ...thin, seed: seed + 3 + k })
      rc.rectangle(x0 + 18, y0 + 122, pw - 36, ph - 136, { ...hatchA, hachureGap: 14, seed: seed + 8 })
      // Approve key, slightly offset like the landing's 3D key.
      const kw = w * 0.56, kh = h * 0.24, kx = X(0.18) - kw / 2, ky = Y(0.5)
      rc.rectangle(kx + 8, ky + 10, kw, kh, { ...solid, seed: seed + 9 })
      rc.rectangle(kx, ky, kw, kh, { ...ln, fill: t.paper, fillStyle: 'solid', seed: seed + 10 })
      label(pt ? 'Aprovar ✓' : 'Approve ✓', kx + kw / 2, ky + kh * 0.66, kh * 0.44)
      break
    }
    case 1: {
      // A profile with the Connect button; a daily loop around it.
      const cw = w * 0.6, ch = h * 0.62
      const x0 = X(-1), y0 = Y(-0.62)
      rc.rectangle(x0, y0, cw, ch, { ...ln, seed })
      rc.circle(x0 + ch * 0.36, y0 + ch * 0.4, ch * 0.42, hatchA)
      rc.line(x0 + ch * 0.7, y0 + ch * 0.3, x0 + cw - 20, y0 + ch * 0.3, { ...thin, seed: seed + 1 })
      rc.line(x0 + ch * 0.7, y0 + ch * 0.5, x0 + cw * 0.7, y0 + ch * 0.5, { ...thin, seed: seed + 2 })
      pill(x0 + ch * 0.7, y0 + ch * 0.64, cw - ch * 0.7 - 20, ch * 0.24, pt ? '+ Conectar' : '+ Connect', t.ink, 3)
      // Daily cycle arrow.
      const ax = X(0.74), ay = Y(0.12), rr = h * 0.28
      rc.arc(ax, ay, rr * 2, rr * 2, -Math.PI * 0.15, Math.PI * 1.55, false, { ...ln, strokeWidth: 3.5, seed: seed + 5 })
      const ex = ax + Math.cos(-Math.PI * 0.15) * rr, ey = ay + Math.sin(-Math.PI * 0.15) * rr
      rc.linearPath([[ex - 18, ey - 16], [ex, ey], [ex + 6, ey - 22]], { ...ln, strokeWidth: 3.5, seed: seed + 6 })
      label(pt ? 'diário' : 'daily', ax, ay + 9, 24)
      break
    }
    case 2: {
      // Profile cards; a magnifier picks out the ones that fit the ICP.
      const cw = w * 0.62, ch = h * 0.24
      profile(X(-0.92), Y(-0.86), cw, ch, ln, 0)
      profile(X(-0.78), Y(-0.24), cw, ch, hatchA, 10)
      profile(X(-0.92), Y(0.38), cw, ch, ln, 20)
      rc.circle(X(0.5), Y(-0.08), h * 0.5, { ...ln, strokeWidth: 4, seed: seed + 30 })
      rc.line(X(0.5) + h * 0.18, Y(-0.08) + h * 0.18, X(0.5) + h * 0.36, Y(-0.08) + h * 0.38, { ...ln, strokeWidth: 9, seed: seed + 31 })
      rc.linearPath([[X(0.42), Y(-0.08)], [X(0.48), Y(0.04)], [X(0.62), Y(-0.2)]], { ...ln, strokeWidth: 5, seed: seed + 32 })
      break
    }
    case 3: {
      // The lead board: four stages, a card being dragged toward "call booked".
      const stages = PIPELINE[lang]
      const colW = w / 4 - 8
      const top = Y(-0.62)
      stages.forEach((st, k) => {
        const x = X(-1) + k * (colW + 10.6)
        rc.rectangle(x, top, colW, h * 0.82, { ...thin, seed: seed + k })
        let fs = 18
        ctx.font = `700 ${fs}px ${t.body}`
        while (fs > 13 && ctx.measureText(st).width > colW - 8) ctx.font = `700 ${(fs -= 1)}px ${t.body}`
        label(st, x + colW / 2, top - 12, fs)
        const cards = [3, 2, 1, 1][k]
        for (let c = 0; c < cards; c++) {
          const done = k === 3
          rc.rectangle(x + 8, top + 14 + c * (h * 0.24), colW - 16, h * 0.18, done ? { ...hatchB, seed: seed + 10 + k * 4 + c } : { ...thin, seed: seed + 10 + k * 4 + c })
          rc.circle(x + 24, top + 14 + c * (h * 0.24) + h * 0.09, h * 0.08, { ...thin, seed: seed + 30 + k * 4 + c })
        }
      })
      // Cursor dragging a card from Engaging to Reach out.
      const cx0 = X(-1) + 1 * (colW + 10.6) + colW * 0.7, cy0 = top + h * 0.6
      rc.curve([[cx0, cy0], [cx0 + colW * 0.5, cy0 + h * 0.12], [cx0 + colW * 0.95, cy0 + h * 0.02]], { ...ln, strokeLineDash: [10, 9], seed: seed + 50 })
      const px = cx0 + colW * 0.95, py = cy0 + h * 0.02
      rc.polygon([[px, py], [px + 30, py + 12], [px + 16, py + 18], [px + 12, py + 34]], { ...solid, seed: seed + 51 })
      break
    }
    case 4: {
      // Their post: we like it and suggest a comment. Signal waves from the avatar.
      const pw = w * 0.66, ph = h * 0.6
      const x0 = X(-0.95), y0 = Y(-0.82)
      rc.rectangle(x0, y0, pw, ph, { ...ln, seed })
      rc.circle(x0 + 34, y0 + 32, 36, { ...thin, seed: seed + 1 })
      for (let k = 0; k < 3; k++) rc.arc(x0 + 34, y0 + 32, 56 + k * 26, 56 + k * 26, -Math.PI * 0.95, -Math.PI * 0.55, false, { ...thin, seed: seed + 2 + k })
      for (let k = 0; k < 2; k++) rc.line(x0 + 18, y0 + 70 + k * 18, x0 + pw - (k === 1 ? pw * 0.45 : 18), y0 + 70 + k * 18, { ...thin, seed: seed + 6 + k })
      // Like: a hand-drawn heart.
      const hx = x0 + 34, hy = y0 + ph - 24
      rc.path(`M ${hx} ${hy + 14} C ${hx - 26} ${hy - 4} ${hx - 14} ${hy - 26} ${hx} ${hy - 10} C ${hx + 14} ${hy - 26} ${hx + 26} ${hy - 4} ${hx} ${hy + 14} Z`, { ...hatchB, hachureGap: 5, seed: seed + 10 })
      label(pt ? 'Curtido' : 'Liked', hx + 66, hy + 8, 20)
      // Suggested comment bubble.
      const bw = w * 0.58, bh = h * 0.34, bx = X(0.42) - bw / 2, by = Y(0.3)
      rc.rectangle(bx, by, bw, bh, { ...ln, fill: t.paper, fillStyle: 'solid', seed: seed + 11 })
      rc.polygon([[bx + 24, by], [bx + 10, by - 26], [bx + 52, by]], { ...ln, fill: t.paper, fillStyle: 'solid', seed: seed + 12 })
      label(pt ? 'Comentário sugerido' : 'Suggested comment', bx + bw / 2, by + 34, 19)
      rc.line(bx + 20, by + bh - 28, bx + bw - 20, by + bh - 28, { ...thin, seed: seed + 13 })
      break
    }
    default: {
      // The hot-lead alert turned call: a calendar invite marked booked.
      const cw = w * 0.8, ch = h * 0.92
      const x0 = cx - cw / 2, y0 = Y(-0.95)
      rc.rectangle(x0, y0, cw, ch, { ...ln, seed })
      rc.rectangle(x0, y0, cw, ch * 0.24, hatchA)
      rc.line(x0 + cw * 0.25, y0 - 14, x0 + cw * 0.25, y0 + 18, { ...ln, strokeWidth: 5, seed: seed + 1 })
      rc.line(x0 + cw * 0.75, y0 - 14, x0 + cw * 0.75, y0 + 18, { ...ln, strokeWidth: 5, seed: seed + 2 })
      // Two people on a call.
      rc.circle(x0 + cw * 0.28, y0 + ch * 0.52, ch * 0.22, { ...thin, seed: seed + 3 })
      rc.circle(x0 + cw * 0.5, y0 + ch * 0.52, ch * 0.22, hatchB)
      rc.line(x0 + cw * 0.38, y0 + ch * 0.52, x0 + cw * 0.4, y0 + ch * 0.52, { ...thin, seed: seed + 4 })
      // Booked badge.
      const bx = x0 + cw * 0.78, by = y0 + ch * 0.52
      rc.circle(bx, by, ch * 0.3, { ...ln, fill: t.ink, fillStyle: 'solid', seed: seed + 5 })
      rc.linearPath([[bx - 16, by], [bx - 4, by + 12], [bx + 18, by - 12]], { ...ln, stroke: t.paper, strokeWidth: 5, seed: seed + 6 })
      label(PIPELINE[lang][3], x0 + cw / 2, y0 + ch * 0.9, 21)
    }
  }
}

/**
 * The other way to open the gift: the logo on the chest is an NFC tag. A hand-drawn phone with
 * waves over a short caption, in a column ending at `right`, centred on the QR's height.
 */
function nfcNote(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, caption: string, right: number, qrY: number, qrSize: number) {
  // Wide enough for the default caption on one line; longer edits wrap.
  const colW = 680
  const cx = right - colW / 2
  const icon = 120
  const font = `500 28px ${t.body}`
  const lh = 28 * 1.45
  const lines = wrap(ctx, caption, font, colW, 0).slice(0, 4)
  const h = icon + 44 + lines.length * lh
  const top = qrY + (qrSize - h) / 2
  nfcIcon(rc, t, cx, top + icon / 2, icon)
  let y = top + icon + 44 + 28 * 0.75
  for (const line of lines) {
    text(ctx, line, cx, y, font, t.soft, 'center', 0)
    y += lh
  }
}

/** Same drawing as the map's drawNfcIcon, with rough.js strokes so it sits with the letter's other sketches. */
function nfcIcon(rc: RoughCanvas, t: LetterSpec, cx: number, cy: number, size: number) {
  const o: Options = { stroke: t.ink, strokeWidth: 3.5, roughness: 1.2, bowing: 1, seed: 88 }
  const ph = size * 0.92, pw = ph * 0.52, r = pw * 0.18
  const x0 = cx - size * 0.5, y0 = cy - ph / 2
  rc.path(
    `M ${x0 + r} ${y0} H ${x0 + pw - r} Q ${x0 + pw} ${y0} ${x0 + pw} ${y0 + r} V ${y0 + ph - r} Q ${x0 + pw} ${y0 + ph} ${x0 + pw - r} ${y0 + ph} H ${x0 + r} Q ${x0} ${y0 + ph} ${x0} ${y0 + ph - r} V ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} Z`,
    o,
  )
  rc.line(x0 + pw * 0.34, y0 + ph * 0.1, x0 + pw * 0.66, y0 + ph * 0.1, { ...o, strokeWidth: 3, seed: 89 })
  rc.circle(x0 + pw / 2, y0 + ph * 0.9, size * 0.07, { ...o, fill: t.ink, fillStyle: 'solid', strokeWidth: 2, seed: 90 })
  const wx = x0 + pw + size * 0.04
  ;[0.17, 0.3, 0.43].forEach((k, i) => {
    const d = size * k * 2
    rc.arc(wx, cy, d, d, -Math.PI * 0.28, Math.PI * 0.28, false, { ...o, seed: 91 + i })
  })
}

/**
 * `inset` is the quiet zone on each side. A smaller panel needs a smaller one to keep the modules
 * printable: at 300 dpi a module under ~0.5 mm stops being reliable on this paper.
 */
function qr(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, url: string, x: number, y: number, size: number, inset = 35) {
  ctx.fillStyle = t.qrPanel
  ctx.fillRect(x + 6, y + 6, size - 12, size - 12)
  rc.rectangle(x, y, size, size, { stroke: t.ink, strokeWidth: 4, roughness: 1.3, seed: 77 })
  if (!url) {
    text(ctx, 'QR PENDENTE', x + size / 2, y + size / 2 + 10, `700 26px ${t.body}`, t.soft, 'center', 0.2)
    return
  }
  const code = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = code.modules.size
  const area = size - inset * 2
  const m = area / n
  const ox = x + (size - area) / 2
  const oy = y + (size - area) / 2
  ctx.fillStyle = t.qrModule
  ctx.beginPath()
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (code.modules.get(r, c)) ctx.rect(ox + c * m - 0.25, oy + r * m - 0.25, m + 0.5, m + 0.5)
  ctx.fill()
}
