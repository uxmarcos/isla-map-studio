import QRCode from 'qrcode'
import rough from 'roughjs'
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { Options } from 'roughjs/bin/core'
import type { Lang, LetterText, MapStyle } from '../types'
import { loadImage } from '../map/logo'
import { MARK_PATH, MARK_VIEWBOX } from '../map/islaMark'
import { fillVars, PIPELINE } from './copy'
import { qrLabel } from '../qr'

const SERIF = '"Libre Baskerville", "Times New Roman", serif'
/** Body text on the letter; headings use the map's serif. */
const SANS = '"Manrope", "Inter", ui-sans-serif, sans-serif'

/** A4 portrait at 300 dpi. */
export const LETTER_W = 2480
export const LETTER_H = 3508

interface LetterSpec {
  src: string
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
    src: '/letter-white.jpg', paper: '#E6E5E0', ink: '#161616', soft: '#2E2E2C',
    accent: 'rgba(22,22,22,0.55)', accent2: 'rgba(22,22,22,0.8)', qrPanel: '#E6E5E0', qrModule: '#161616',
  },
  dark: {
    src: '/letter-dark.jpg', paper: '#141414', ink: '#F5F5F2', soft: '#D9D9D4',
    accent: 'rgba(245,245,242,0.5)', accent2: 'rgba(245,245,242,0.8)', qrPanel: '#F5F5F2', qrModule: '#0A0A0A',
  },
  // Matches the colour map: light parchment, its dark ink, the sea's teal and the roofs' terracotta.
  color: {
    src: '/letter-color.jpg', paper: '#E7D8BA', ink: '#2A251E', soft: '#463E33',
    accent: 'rgba(72,128,138,0.7)', accent2: 'rgba(168,86,56,0.72)', qrPanel: '#EFE3C8', qrModule: '#221F1D',
  },
}

let fontsPromise: Promise<unknown> | null = null
export const loadLetterFonts = () =>
  (fontsPromise ??= Promise.all(
    ['400 40px "Manrope"', '500 40px "Manrope"', '600 40px "Manrope"', '700 40px "Manrope"', '700 40px "Libre Baskerville"', 'italic 400 40px "Libre Baskerville"'].map((f) =>
      document.fonts.load(f),
    ),
  ))

const papers = new Map<string, Promise<HTMLImageElement>>()
export const loadPaper = (style: MapStyle) => {
  const { src } = LETTER_SPECS[style]
  if (!papers.has(src)) papers.set(src, loadImage(src))
  return papers.get(src)!
}

export interface LetterData {
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

/** Draws the full letter onto a canvas of any size, laid out in A4 pixels at 300 dpi. */
export function drawLetter(canvas: HTMLCanvasElement, style: MapStyle, paper: HTMLImageElement, d: LetterData) {
  const t = LETTER_SPECS[style]
  const ctx = canvas.getContext('2d')!
  const k = canvas.width / LETTER_W
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(paper, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.textBaseline = 'alphabetic'
  const rc = rough.canvas(canvas)
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
    ctx.font = `700 ${fs}px ${SERIF}`
    while (fs > 36 && ctx.measureText(d.company).width > 620) ctx.font = `700 ${(fs -= 2)}px ${SERIF}`
    text(ctx, d.company.trim() || 'Company', LETTER_W / 2 + sideGap, headCy, `700 ${fs}px ${SERIF}`, t.ink, 'left', 0)
    ctx.textBaseline = 'alphabetic'
  }
  let y = headCy + 200
  text(ctx, v(d.text.eyebrow).toLocaleUpperCase('pt-BR'), LETTER_W / 2, y, `600 32px ${SANS}`, t.soft, 'center', 0.28)

  // Title, up to two lines, shrinking if needed.
  y += 140
  const title = v(d.text.title)
  let size = 104
  let lines: string[] = []
  for (; size >= 64; size -= 4) {
    lines = wrap(ctx, title, `700 ${size}px ${SERIF}`, CONTENT_W, 0)
    if (lines.length <= 2) break
  }
  for (const line of lines) {
    text(ctx, line, LETTER_W / 2, y, `700 ${size}px ${SERIF}`, t.ink, 'center', 0)
    y += size * 1.2
  }

  // Ornament: line, diamond, line.
  y += 10
  divider(ctx, t, y)
  y += 120

  // Intro paragraph.
  y = paragraph(ctx, v(d.text.intro), y, `400 42px ${SANS}`, 42 * 1.65, t.soft)

  // How it works.
  y += 110
  text(ctx, v(d.text.howTitle), LETTER_W / 2, y, `700 60px ${SERIF}`, t.ink, 'center', 0)
  ctx.font = `700 60px ${SERIF}`
  ctx.letterSpacing = '0px'
  const hw = ctx.measureText(v(d.text.howTitle)).width
  rc.curve(
    [[LETTER_W / 2 - hw / 2 - 20, y + 34], [LETTER_W / 2 - hw / 6, y + 44], [LETTER_W / 2 + hw / 4, y + 30], [LETTER_W / 2 + hw / 2 + 20, y + 40]],
    { stroke: t.ink, strokeWidth: 3.5, roughness: 1.2, seed: 41 },
  )
  y += 105

  // Six hand-drawn step cards, three per row. The footer (QR) is pinned to the bottom,
  // so a long title or intro makes the cards a little shorter instead of overflowing.
  const gap = 60
  const cardW = (CONTENT_W - gap * 2) / 3
  const closingH = wrap(ctx, v(d.text.closing), `400 42px ${SANS}`, CONTENT_W - 80, 0).length * 42 * 1.65
  const FOOTER_TOP = LETTER_H - M - 340 - 40
  const cardH = Math.max(540, Math.min(620, (FOOTER_TOP - 60 - closingH - 130 - y - gap) / 2))
  d.text.steps.slice(0, 6).forEach((step, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    stepCard(ctx, rc, t, d.lang, i, v(step.title), v(step.text), M + col * (cardW + gap), y + row * (cardH + gap), cardW, cardH)
  })
  y += cardH * 2 + gap + 130

  // Closing paragraph.
  y = paragraph(ctx, v(d.text.closing), y, `400 42px ${SANS}`, 42 * 1.65, t.soft)

  // Footer: sign-off on the left, QR on the right, both anchored to the bottom margin.
  const qrSize = 340
  const qrX = LETTER_W - M - qrSize
  const qrY = FOOTER_TOP
  let sy = qrY + 120
  for (const line of v(d.text.signoff).split('\n')) {
    text(ctx, line, M, sy, `italic 400 50px ${SERIF}`, t.ink, 'left', 0)
    sy += 50 * 1.5
  }
  qr(ctx, rc, t, d.qrUrl, qrX, qrY, qrSize)
  const label = qrLabel(d.qrUrl)
  text(ctx, v(d.text.qrCaption).toLocaleUpperCase('pt-BR'), qrX + qrSize / 2, qrY + qrSize + (label ? 58 : 64), `700 24px ${SANS}`, t.ink, 'center', 0.2)
  if (label) text(ctx, label.toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 98, `500 23px ${SANS}`, t.soft, 'center', 0.14)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
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

function divider(ctx: Ctx, t: LetterSpec, y: number) {
  const half = 420
  const cx = LETTER_W / 2
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 3
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

  // Number in a hand-drawn circle, top-left.
  rc.circle(x + 62, y + 62, 72, { ...base, strokeWidth: 3, seed: 200 + i })
  text(ctx, String(i + 1), x + 62, y + 77, `700 40px ${SERIF}`, t.ink, 'center', 0)

  const squeeze = 620 - h
  // Kept clear of the number circle in the corner.
  illustration(ctx, rc, t, lang, i, x + w / 2 + 20, y + 225 - squeeze * 0.4, w - 170, 240 - squeeze * 0.35)

  let ty = y + 405 - squeeze * 0.55
  const tLines = wrap(ctx, title.toLocaleUpperCase('pt-BR'), `700 31px ${SERIF}`, w - 70, 0.04)
  for (const line of tLines.slice(0, 2)) {
    text(ctx, line, x + w / 2, ty, `700 31px ${SERIF}`, t.ink, 'center', 0.04)
    ty += 31 * 1.3
  }
  ty += 16
  for (const line of wrap(ctx, body, `400 27px ${SANS}`, w - 80, 0).slice(0, 4)) {
    text(ctx, line, x + w / 2, ty, `400 27px ${SANS}`, t.soft, 'center', 0)
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
    text(ctx, s, x, y, `${weight} ${size}px ${SANS}`, color, 'center', 0)
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
        ctx.font = `700 ${fs}px ${SANS}`
        while (fs > 13 && ctx.measureText(st).width > colW - 8) ctx.font = `700 ${(fs -= 1)}px ${SANS}`
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

function qr(ctx: Ctx, rc: RoughCanvas, t: LetterSpec, url: string, x: number, y: number, size: number) {
  ctx.fillStyle = t.qrPanel
  ctx.fillRect(x + 6, y + 6, size - 12, size - 12)
  rc.rectangle(x, y, size, size, { stroke: t.ink, strokeWidth: 4, roughness: 1.3, seed: 77 })
  if (!url) {
    text(ctx, 'QR PENDENTE', x + size / 2, y + size / 2 + 10, `700 26px ${SANS}`, t.soft, 'center', 0.2)
    return
  }
  const code = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = code.modules.size
  const area = size - 70
  const m = area / n
  const ox = x + (size - area) / 2
  const oy = y + (size - area) / 2
  ctx.fillStyle = t.qrModule
  ctx.beginPath()
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (code.modules.get(r, c)) ctx.rect(ox + c * m - 0.25, oy + r * m - 0.25, m + 0.5, m + 0.5)
  ctx.fill()
}
