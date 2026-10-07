import QRCode from 'qrcode'
import { qrLabel } from '../qr'
import type { Lang, MapData, MapStyle } from '../types'
import { TEMPLATES, type Plaque, type TemplateSpec, type TextSlot } from './layout'
import { loadImage } from './logo'
import { MARK_PATH, MARK_VIEWBOX } from './islaMark'

const templates = new Map<string, Promise<HTMLImageElement>>()
export const loadTemplate = (style: MapStyle) => {
  const { src } = TEMPLATES[style]
  if (!templates.has(src)) templates.set(src, loadImage(src))
  return templates.get(src)!
}

let fontsPromise: Promise<unknown> | null = null
export const loadMapFonts = () =>
  (fontsPromise ??= Promise.all(
    ['700 100px "Libre Baskerville"', '400 100px "Libre Baskerville"', 'italic 400 100px "Libre Baskerville"', '400 100px "Jost"', '500 100px "Jost"'].map((f) =>
      document.fonts.load(f),
    ),
  ))

type Ctx = CanvasRenderingContext2D

/** Fixed text printed on the map. */
const COPY: Record<Lang, { titlePrefix: string; titleLast: string; path: string; visit: string; scan: string; nfc: string; fallback: string; here: string }> = {
  en: { titlePrefix: 'THE', titleLast: 'TREASURE MAP', path: 'THE PATH TO', visit: 'VISIT', scan: 'SCAN TO OPEN YOUR GIFT', nfc: 'OR HOLD YOUR PHONE TO THE LOGO ON THE CHEST', fallback: 'COMPANY', here: 'YOU ARE HERE' },
  // No article before the name: Portuguese would need "DA" or "DO" depending on the company.
  pt: { titlePrefix: '', titleLast: 'MAPA DO TESOURO', path: 'O CAMINHO ATÉ', visit: 'ACESSE', scan: 'ESCANEIE PARA ABRIR SEU PRESENTE', nfc: 'OU APROXIME O CELULAR DA LOGO NA FRENTE DO BAÚ', fallback: 'EMPRESA', here: 'VOCÊ ESTÁ AQUI' },
}

const upper = (s: string) => s.trim().toLocaleUpperCase('pt-BR')

/**
 * Draws the full map onto a canvas of any size; everything is laid out in
 * template pixels and scaled to the canvas width.
 */
export function drawMap(
  canvas: HTMLCanvasElement, style: MapStyle, template: HTMLImageElement, data: MapData, logo: HTMLCanvasElement | null,
) {
  const t = TEMPLATES[style]
  const ctx = canvas.getContext('2d')!
  const k = canvas.width / t.w
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(template, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.fillStyle = t.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const copy = COPY[data.lang]
  drawHeader(ctx, t, logo)
  drawTitle(ctx, t, copy, upper(data.company) || copy.fallback)
  // The subtitle names the treasure: the same text as the last plaque, by the X.
  drawSubtitle(ctx, t, `${copy.path} ${upper(data.destination)}`)
  if (t.titleRule) drawTitleRule(ctx, t, t.titleRule)

  const labels = [...data.stages.slice(0, 5), data.destination]
  t.plaques.forEach((p, i) => {
    const bottom = drawPlaque(ctx, t, template, upper(labels[i] ?? ''), p)
    const note = (data.stageNotes[i] ?? '').trim()
    if (i < 5 && note) drawNote(ctx, t, note, p.cx, bottom + t.note.gap)
  })

  if (!t.dangers.whirlpool.baked) drawWhirlpool(ctx, t)
  const w = t.dangers.whirlpool
  // Label just under the (flattened) whirlpool.
  drawDanger(ctx, t, data.dangers.whirlpool, { cx: w.cx, cy: w.cy + w.r * WHIRL_SQUASH * 1.38 + t.dangers.size * 1.5 })
  drawDanger(ctx, t, data.dangers.kraken, t.dangers.kraken)
  if (data.start.trim()) drawStart(ctx, t, copy.here, data.start.trim())
  drawCompassMark(ctx, t)

  drawQr(ctx, t, data.qrUrl)
  drawNfc(ctx, t, copy.nfc)
  ctx.fillStyle = t.ink
  // The gift link is short (gift.isla.to/acme), so it is printed too; without it, only an invitation.
  const label = qrLabel(data.qrUrl)
  const urlW = drawFitted(ctx, label ? `${copy.visit} ${upper(label)}` : copy.scan, t.fonts.url, t.url)
  if (t.urlRules) drawUrlRules(ctx, t, urlW)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

const u = (t: TemplateSpec) => t.w / 4344

/** Line, hollow diamond, line: the ornament between the title and the subtitle. */
function drawTitleRule(ctx: Ctx, t: TemplateSpec, r: NonNullable<TemplateSpec['titleRule']>) {
  const k = u(t), d = 13 * k, gap = 30 * k
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 3.5 * k
  ctx.beginPath()
  ctx.moveTo(r.cx - r.half, r.y)
  ctx.lineTo(r.cx - gap, r.y)
  ctx.moveTo(r.cx + gap, r.y)
  ctx.lineTo(r.cx + r.half, r.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(r.cx, r.y - d)
  ctx.lineTo(r.cx + d, r.y)
  ctx.lineTo(r.cx, r.y + d)
  ctx.lineTo(r.cx - d, r.y)
  ctx.closePath()
  ctx.lineWidth = 3 * k
  ctx.stroke()
}

/** A short rule on each side of the URL, following its width. */
function drawUrlRules(ctx: Ctx, t: TemplateSpec, textW: number) {
  const { gap, length } = t.urlRules!
  const y = t.url.baseline - (CAP * t.url.size) / 2
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 3.5 * u(t)
  ctx.beginPath()
  ctx.moveTo(t.url.cx - textW / 2 - gap - length, y)
  ctx.lineTo(t.url.cx - textW / 2 - gap, y)
  ctx.moveTo(t.url.cx + textW / 2 + gap, y)
  ctx.lineTo(t.url.cx + textW / 2 + gap + length, y)
  ctx.stroke()
}

/**
 * Isla mark | rule | client logo above the title, laid out like the letter's header: the rule
 * sits on the title's axis. Without a logo the mark stands alone, centred.
 */
function drawHeader(ctx: Ctx, t: TemplateSpec, logo: HTMLCanvasElement | null) {
  const { cx, cy, markH, gap, ruleH, logoMaxW, logoMaxH } = t.header
  const u = t.w / 4344
  const k = markH / MARK_VIEWBOX.h
  const markW = MARK_VIEWBOX.w * k
  ctx.save()
  ctx.translate(logo ? cx - gap - markW : cx - markW / 2, cy - markH / 2)
  ctx.scale(k, k)
  ctx.fillStyle = t.ink
  ctx.fill(new Path2D(MARK_PATH), 'evenodd')
  ctx.restore()
  if (!logo) return
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 5 * u
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy - ruleH / 2)
  ctx.lineTo(cx, cy + ruleH / 2)
  ctx.stroke()
  const s = Math.min(logoMaxW / logo.width, logoMaxH / logo.height)
  const w = logo.width * s
  const h = logo.height * s
  ctx.drawImage(logo, cx + gap, cy - h / 2, w, h)
}

/**
 * "THE {COMPANY} / TREASURE MAP" on two lines, all lines sharing one size.
 * Long names that would get too small move to three lines in the same space:
 * "THE {first half} / {second half} / TREASURE MAP".
 */
function drawTitle(ctx: Ctx, t: TemplateSpec, copy: (typeof COPY)[Lang], company: string) {
  const font = t.fonts.title
  const { size, minSize, maxW, tracking, cx, line1Baseline, line2Baseline } = t.title
  const sizeFor = (lines: string[], max: number) =>
    Math.min(...lines.map((l) => fit(ctx, l, font, max, minSize * 0.6, maxW, tracking)))

  const head = [copy.titlePrefix, company].filter(Boolean)
  let lines = [head.join(' '), copy.titleLast]
  let s = sizeFor(lines, size)
  let baselines = [line1Baseline, line2Baseline]

  const words = head.join(' ').split(/\s+/)
  if (s < minSize && words.length > 1) {
    const [a, b] = splitLines(ctx, words, 2, font.replace('{s}', '100'), 100 * tracking)
    const three = [a, b, copy.titleLast]
    // Three lines in the same block: cap top of line 1 to the original last baseline.
    const top = line1Baseline - size * 0.7
    const s3 = Math.min(sizeFor(three, size), (line2Baseline - top) / (0.7 + 2 * 1.08))
    if (s3 > s) {
      lines = three
      s = s3
      const step = s * 1.08
      baselines = [line2Baseline - 2 * step, line2Baseline - step, line2Baseline]
    }
  }
  setFont(ctx, font.replace('{s}', String(s)), s * tracking)
  lines.forEach((l, i) => ctx.fillText(l, cx + (s * tracking) / 2, baselines[i], maxW + s * tracking))
}

function setFont(ctx: Ctx, font: string, spacingPx: number) {
  ctx.font = font
  ctx.letterSpacing = `${spacingPx}px`
}

/** Width of text with tracking; canvas adds spacing after the last glyph too, so subtract it. */
function width(ctx: Ctx, text: string, spacingPx: number) {
  return ctx.measureText(text).width - spacingPx
}

/** Largest size (stepping down) at which text fits maxW. `font` uses {s} for the size. */
function fit(ctx: Ctx, text: string, font: string, size: number, min: number, maxW: number, tracking: number) {
  for (let s = size; s > min; s -= 1) {
    setFont(ctx, font.replace('{s}', String(s)), s * tracking)
    if (width(ctx, text, s * tracking) <= maxW) return s
  }
  return min
}

/** Returns the drawn text's width. */
function drawFitted(ctx: Ctx, text: string, font: string, o: TextSlot) {
  const s = fit(ctx, text, font, o.size, o.minSize, o.maxW, o.tracking)
  setFont(ctx, font.replace('{s}', String(s)), s * o.tracking)
  // Shift by half the trailing spacing so the text is optically centred.
  ctx.fillText(text, o.cx + (s * o.tracking) / 2, o.baseline, o.maxW + s * o.tracking)
  return Math.min(o.maxW, width(ctx, text, s * o.tracking))
}

/** One line, or two at the minimum size when the goal is long. */
function drawSubtitle(ctx: Ctx, t: TemplateSpec, text: string) {
  const o = t.subtitle
  const font = t.fonts.subtitle
  const one = fit(ctx, text, font, o.size, 1, o.maxW, o.tracking)
  const words = text.split(/\s+/)
  if (one >= o.minSize || words.length < 2) return drawFitted(ctx, text, font, o)
  const lines = splitLines(ctx, words, 2, font.replace('{s}', String(o.minSize)), o.minSize * o.tracking)
  const s = Math.max(o.minSize, Math.min(...lines.map((l) => fit(ctx, l, font, o.size, 1, o.maxW, o.tracking))))
  setFont(ctx, font.replace('{s}', String(s)), s * o.tracking)
  const step = s * 1.3
  lines.forEach((l, i) => ctx.fillText(l, o.cx + (s * o.tracking) / 2, o.baseline + i * step, o.maxW + s * o.tracking))
}

const CAP = 0.7 // cap height / font size
const LINE_GAP = 0.42 // gap between lines / font size; leaves room for accents (Õ, É)
const blockHeight = (n: number, s: number) => n * CAP * s + (n - 1) * LINE_GAP * s

/**
 * Picks 1–3 balanced lines at the largest size that fits the artwork's plaque.
 * If that would go below the readable minimum, keeps the minimum and draws a
 * larger plaque over the original instead.
 */
/** Returns the plaque's bottom edge (it may have grown). */
function drawPlaque(ctx: Ctx, t: TemplateSpec, template: HTMLImageElement, text: string, p: Plaque): number {
  // Artwork without plaques of its own: every plaque gets a frame, even an empty one.
  if (t.plaqueFrame.always) drawPlaqueFrame(ctx, t, p.cx, p.cy, p.w, p.h)
  if (!text) return p.cy + p.h / 2
  const font = t.fonts.plaque
  const { size, minSize, tracking } = t.plaqueText
  const words = text.split(/\s+/)
  const options = [1, 2, 3, 4].filter((n) => n <= words.length)
    .map((n) => splitLines(ctx, words, n, font.replace('{s}', String(minSize)), minSize * tracking))

  // Largest size inside the original plaque.
  let best = { lines: options[0], s: 0 }
  for (const lines of options.slice(0, 3)) {
    const byWidth = Math.min(...lines.map((l) => fit(ctx, l, font, size, 1, p.innerW, tracking)))
    const byHeight = p.innerH / (lines.length * CAP + (lines.length - 1) * LINE_GAP)
    const s = Math.floor(Math.min(byWidth, byHeight, size))
    // An extra line has to earn its place: only when it makes the text clearly bigger.
    if (s > best.s * 1.15) best = { lines, s }
  }

  let { lines, s } = best
  let plaqueH = p.h
  if (s < minSize) {
    // Grow the plaque: at the minimum size, pick the line count that needs the least growth.
    s = minSize
    setFont(ctx, font.replace('{s}', String(s)), s * tracking)
    let bestGrow = Infinity
    for (const option of options) {
      const w = Math.max(...option.map((l) => width(ctx, l, s * tracking)))
      const grow = Math.max(w / p.innerW, blockHeight(option.length, s) / p.innerH)
      if (grow < bestGrow) {
        bestGrow = grow
        lines = option
      }
    }
    const textW = Math.max(...lines.map((l) => width(ctx, l, s * tracking)))
    const w = Math.max(p.w, textW + (p.w - p.innerW))
    const h = Math.max(p.h, blockHeight(lines.length, s) + (p.h - p.innerH))
    if (t.plaqueFrame.art) stretchArtPlaque(ctx, t, template, p, w, h)
    else drawPlaqueFrame(ctx, t, p.cx, p.cy, w, h)
    plaqueH = h
  }

  ctx.fillStyle = t.ink
  setFont(ctx, font.replace('{s}', String(s)), s * tracking)
  let y = p.cy - blockHeight(lines.length, s) / 2 + CAP * s
  for (const line of lines) {
    ctx.fillText(line, p.cx + (s * tracking) / 2, y)
    y += (CAP + LINE_GAP) * s
  }
  return p.cy + plaqueH / 2
}

interface TagBlock { text: string; font: string; size: number; tracking: number }

/**
 * A small framed label in the plaque style, sized to its text. Each block wraps
 * onto as few lines as fit maxW at its (readable) size; the frame grows to fit.
 * Returns the frame's box.
 */
/** lead: room left of the text, for an icon. */
function drawTag(ctx: Ctx, t: TemplateSpec, cx: number, top: number, blocks: TagBlock[], maxW: number, lead = 0) {
  const laid = blocks.map((b) => {
    const font = b.font.replace('{s}', String(b.size))
    const sp = b.size * b.tracking
    const words = b.text.split(/\s+/)
    let lines = [b.text]
    for (let n = 1; n <= Math.min(3, words.length); n++) {
      lines = splitLines(ctx, words, n, font, sp)
      setFont(ctx, font, sp)
      if (Math.max(...lines.map((l) => width(ctx, l, sp))) <= maxW) break
    }
    setFont(ctx, font, sp)
    return { ...b, font, sp, lines, w: Math.max(...lines.map((l) => width(ctx, l, sp))), h: blockHeight(lines.length, b.size) }
  })
  const s0 = blocks[blocks.length - 1].size
  const between = s0 * 0.55
  const padX = s0 * 0.95, padTop = s0 * 0.7, padBottom = s0 * 0.9 // room for descenders
  const w = Math.max(...laid.map((b) => b.w)) + padX * 2 + lead
  const h = laid.reduce((a, b) => a + b.h, 0) + between * (laid.length - 1) + padTop + padBottom
  const cy = top + h / 2
  drawPlaqueFrame(ctx, t, cx, cy, w, h, t.plaqueFrame.tagShape)
  ctx.fillStyle = t.ink
  let y = top + padTop
  for (const b of laid) {
    setFont(ctx, b.font, b.sp)
    let base = y + CAP * b.size
    for (const line of b.lines) {
      ctx.fillText(line, cx + lead / 2 + b.sp / 2, base)
      base += (CAP + LINE_GAP) * b.size
    }
    y += b.h + between
  }
  return { x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h, cy, padX }
}

const italic = (t: TemplateSpec) => t.fonts.plaque.replace(/^\d+ /, 'italic 400 ')

/** What Isla does on this island, just under its plaque. */
function drawNote(ctx: Ctx, t: TemplateSpec, text: string, cx: number, top: number) {
  drawTag(ctx, t, cx, top, [{ text, font: italic(t), size: t.note.size, tracking: 0 }], t.note.maxW)
}

/** Names a danger under a sea creature. */
function drawDanger(ctx: Ctx, t: TemplateSpec, text: string, at: { cx: number; cy: number }) {
  const label = upper(text)
  if (!label) return
  const { size, maxW } = t.dangers
  // Measure first so the tag is centred on the creature.
  const probe = blockHeight(1, size) + size * 1.6
  const icon = size * 1.25
  const box = drawTag(ctx, t, at.cx, at.cy - probe / 2, [{ text: label, font: t.fonts.plaque, size, tracking: 0.06 }], maxW, icon + size * 0.5)
  drawWarning(ctx, t, box.x0 + box.padX * 0.8 + icon / 2, box.cy, icon)
}

/**
 * The other way in: the logo on the chest is an NFC tag. A tag just under the QR, centred on it,
 * with a phone-and-waves icon beside the text (two lines, usually).
 */
function drawNfc(ctx: Ctx, t: TemplateSpec, text: string) {
  const { gap, maxW, size } = t.nfc
  const icon = size * 2
  const sans = t.fonts.url.replace(/^\d+/, '500')
  const top = t.qr.cy + t.qr.frame / 2 + gap
  // The icon is as wide as `icon`; air on both sides of it, inside the tag's padding.
  const air = size * 0.35
  const box = drawTag(ctx, t, t.qr.cx, top, [{ text, font: sans, size, tracking: 0.08 }], maxW, icon + air * 2)
  drawNfcIcon(ctx, t.ink, box.x0 + box.padX + air + icon / 2, box.cy, icon)
}

/** A phone with three waves leaving its side: "hold your phone here". Outline only, in the given ink. */
export function drawNfcIcon(ctx: Ctx, ink: string, cx: number, cy: number, size: number) {
  const ph = size * 0.92, pw = ph * 0.52, r = pw * 0.18
  const x0 = cx - size * 0.5, y0 = cy - ph / 2
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.075
  ctx.beginPath()
  ctx.roundRect(x0, y0, pw, ph, r)
  ctx.stroke()
  // Speaker slit and home dot.
  ctx.beginPath()
  ctx.moveTo(x0 + pw * 0.34, y0 + ph * 0.1)
  ctx.lineTo(x0 + pw * 0.66, y0 + ph * 0.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x0 + pw / 2, y0 + ph * 0.9, size * 0.035, 0, Math.PI * 2)
  ctx.fill()
  // Waves, centred just past the phone's right edge.
  const wx = x0 + pw + size * 0.04
  for (const k of [0.17, 0.3, 0.43]) {
    ctx.beginPath()
    ctx.arc(wx, cy, size * k, -Math.PI * 0.28, Math.PI * 0.28)
    ctx.stroke()
  }
  ctx.restore()
}

/** Warning sign: a rounded triangle with an exclamation mark, in the map's ink. */
function drawWarning(ctx: Ctx, t: TemplateSpec, cx: number, cy: number, size: number) {
  const h = size * 0.88
  const top = cy - h * 0.58, bottom = cy + h * 0.42
  ctx.strokeStyle = t.ink
  ctx.fillStyle = t.ink
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.11
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx + size / 2, bottom)
  ctx.lineTo(cx - size / 2, bottom)
  ctx.closePath()
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.lineWidth = size * 0.12
  ctx.beginPath()
  ctx.moveTo(cx, top + h * 0.34)
  ctx.lineTo(cx, bottom - h * 0.3)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, bottom - h * 0.13, size * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

/** Small deterministic RNG so every render of the whirlpool is identical. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const WHIRL_SQUASH = 0.42 // seen at an angle, like the rest of the map

/**
 * A whirlpool drawn like the engraving around it: a funnel that sinks toward
 * its throat, curved hatch strokes following the current (heavier on the far,
 * shaded wall), foam with an inked edge on the lip, and broken ripples outside.
 */
function drawWhirlpool(ctx: Ctx, t: TemplateSpec) {
  const { cx, cy, r, ink, foam, depth } = t.dangers.whirlpool
  const u = t.w / 4344
  const rand = seeded(11)
  // f = 0 at the rim, 1 at the throat; the centre sinks a little so it reads as a hole.
  const pt = (f: number, a: number): [number, number] => {
    const k = 1 - 0.9 * f
    return [cx + Math.cos(a) * r * k, cy + r * 0.16 * f + Math.sin(a) * r * WHIRL_SQUASH * k]
  }
  /** Tapered stroke along the current, from (f0, a0) turning `turn` radians inward by `df`. */
  const stroke = (f0: number, a0: number, turn: number, df: number, weight: number, color: string, shade = true) => {
    const steps = Math.max(8, Math.round(turn * 14))
    let prev = pt(f0, a0)
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    for (let i = 1; i <= steps; i++) {
      const q = i / steps
      const a = a0 + turn * q
      const p = pt(Math.min(1, f0 + df * q), a)
      const far = shade ? 0.8 + 0.8 * Math.max(0, -Math.sin(a)) : 1
      ctx.lineWidth = weight * u * far * Math.sin(Math.PI * Math.min(0.999, 0.08 + q * 0.84))
      ctx.beginPath()
      ctx.moveTo(prev[0], prev[1])
      ctx.lineTo(p[0], p[1])
      ctx.stroke()
      prev = p
    }
  }

  // 1. Depth: elliptical shadow, darkest in the throat.
  ctx.save()
  ctx.translate(cx, cy + r * 0.1)
  ctx.scale(1, WHIRL_SQUASH)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
  g.addColorStop(0, depth[0])
  g.addColorStop(0.12, depth[0])
  g.addColorStop(0.5, depth[1])
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. Broken ripples outside the rim.
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  for (const [scale, w] of [[1.1, 3], [1.24, 2.4], [1.38, 1.8]]) {
    let a = rand() * Math.PI * 2
    const end = a + Math.PI * 2
    while (a < end) {
      const len = 0.25 + rand() * 0.55
      ctx.lineWidth = w * u
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * scale, r * scale * WHIRL_SQUASH, 0, a, Math.min(end, a + len))
      ctx.stroke()
      a += len + 0.12 + rand() * 0.35
    }
  }

  // 3. Hatching along the current: denser and heavier toward the throat.
  for (let i = 0; i < 34; i++) {
    const f0 = Math.pow(rand(), 0.75) * 0.82
    stroke(f0, rand() * Math.PI * 2, 0.8 + rand() * 1.5, 0.1 + rand() * 0.14, 1.3 + f0 * 2.6, ink)
  }

  // 4. Foam on the lip, each crest with an inked lower edge.
  for (let i = 0; i < 8; i++) {
    const f0 = rand() * 0.3
    const a0 = rand() * Math.PI * 2
    const turn = 0.5 + rand() * 0.9
    stroke(f0, a0, turn, 0.05, 6, foam, false)
    stroke(f0 + 0.035, a0 + 0.06, turn * 0.9, 0.05, 2, ink, false)
  }

  // 5. The throat, with the current spiralling into it.
  for (let k = 0; k < 3; k++) stroke(0.5, (k * Math.PI * 2) / 3, 3.2, 0.5, 3.6, ink)
  const [ex, ey] = pt(1, 0)
  ctx.fillStyle = depth[0].replace(/[\d.]+\)$/, '1)')
  ctx.beginPath()
  ctx.ellipse(ex - r * 0.1, ey, r * 0.1, r * 0.1 * WHIRL_SQUASH, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** "You are here" with the client's starting point, linked to the start of the route. */
function drawStart(ctx: Ctx, t: TemplateSpec, caption: string, text: string) {
  const { cx, cy, maxW, size, dot } = t.start
  const sans = t.fonts.url.replace(/^\d+/, '500')
  const blocks = [
    { text: caption, font: sans, size: Math.round(size * 0.82), tracking: 0.16 },
    { text, font: italic(t), size, tracking: 0 },
  ]
  // Draw once off-canvas to learn the height, then centre it on cy.
  ctx.save()
  ctx.globalAlpha = 0
  const probe = drawTag(ctx, t, cx, 0, blocks, maxW)
  ctx.restore()
  const box = drawTag(ctx, t, cx, cy - (probe.y1 - probe.y0) / 2, blocks, maxW)
  if (!dot) return
  const u = t.w / 4344
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 4 * u
  ctx.setLineDash([12 * u, 10 * u])
  ctx.beginPath()
  ctx.moveTo(box.x1, box.cy)
  ctx.lineTo(dot.x, dot.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = t.ink
  ctx.beginPath()
  ctx.arc(dot.x, dot.y, 13 * u, 0, Math.PI * 2)
  ctx.fill()
}

/** The Isla mark in a medallion at the centre of the compass. */
function drawCompassMark(ctx: Ctx, t: TemplateSpec) {
  const { cx, cy, r } = t.compass
  const u = t.w / 4344
  ctx.fillStyle = t.plaqueFrame.fill
  ctx.strokeStyle = t.ink
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 5 * u
  ctx.stroke()
  ctx.lineWidth = 2 * u
  ctx.beginPath()
  ctx.arc(cx, cy, r - 9 * u, 0, Math.PI * 2)
  ctx.stroke()
  const k = (r * 1.32) / MARK_VIEWBOX.w
  ctx.save()
  ctx.translate(cx - (MARK_VIEWBOX.w * k) / 2, cy - (MARK_VIEWBOX.h * k) / 2)
  ctx.scale(k, k)
  ctx.fillStyle = t.ink
  ctx.fill(new Path2D(MARK_PATH), 'evenodd')
  ctx.restore()
}

/**
 * Redraws the artwork's plaque at a larger size, nine-slice: corners kept, edges and the
 * parchment stretched, so it matches the other plaques.
 */
function stretchArtPlaque(ctx: Ctx, t: TemplateSpec, template: HTMLImageElement, p: Plaque, w: number, h: number) {
  // The image is the 3:2 artwork; spec heights are A4 (see toA4).
  const ky = template.naturalHeight / t.h
  const sx = p.cx - p.w / 2, sy = (p.cy - p.h / 2) * ky, sw = p.w, sh = p.h * ky
  const dx = p.cx - w / 2, dy = p.cy - h / 2
  const c = t.plaqueFrame.corner * 2.4
  const cs = c * ky
  const cols = [[sx, c, dx, c], [sx + c, sw - 2 * c, dx + c, w - 2 * c], [sx + sw - c, c, dx + w - c, c]]
  const rows = [[sy, cs, dy, c], [sy + cs, sh - 2 * cs, dy + c, h - 2 * c], [sy + sh - cs, cs, dy + h - c, c]]
  for (const [x0, xw, x1, xw1] of cols)
    for (const [y0, yh, y1, yh1] of rows) ctx.drawImage(template, x0, y0, xw, yh, x1, y1, xw1, yh1)
}

function drawPlaqueFrame(ctx: Ctx, t: TemplateSpec, cx: number, cy: number, w: number, h: number, shapeOverride?: TemplateSpec['plaqueFrame']['shape']) {
  const { corner, fill, stroke } = t.plaqueFrame
  const shape = shapeOverride ?? t.plaqueFrame.shape
  const path = (inset: number) => {
    const x0 = cx - w / 2 + inset, y0 = cy - h / 2 + inset, x1 = cx + w / 2 - inset, y1 = cy + h / 2 - inset
    ctx.beginPath()
    if (shape === 'rounded') return ctx.roundRect(x0, y0, x1 - x0, y1 - y0, Math.max(2, corner - inset))
    const c = Math.max(4, corner - inset * 0.4)
    ctx.moveTo(x0 + c, y0)
    ctx.lineTo(x1 - c, y0)
    ctx.lineTo(x1, y0 + c)
    ctx.lineTo(x1, y1 - c)
    ctx.lineTo(x1 - c, y1)
    ctx.lineTo(x0 + c, y1)
    ctx.lineTo(x0, y1 - c)
    ctx.lineTo(x0, y0 + c)
    ctx.closePath()
  }
  const u = t.w / 4344
  ctx.fillStyle = fill
  path(0)
  if (t.plaqueFrame.aged) {
    // Old parchment: a soft shadow on the art, and edges that darken like the paper around them.
    ctx.save()
    ctx.shadowColor = 'rgba(40,28,12,0.38)'
    ctx.shadowBlur = 16 * u
    ctx.shadowOffsetY = 5 * u
    ctx.fill()
    ctx.restore()
    const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.2, cx, cy, Math.hypot(w, h) / 2)
    g.addColorStop(0, 'rgba(255,248,230,0.28)')
    g.addColorStop(0.6, 'rgba(120,85,40,0)')
    g.addColorStop(1, 'rgba(110,72,30,0.32)')
    ctx.fillStyle = g
    ctx.fill()
  } else ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 7 * u
  ctx.stroke()
  ctx.lineWidth = 2 * u
  path(12 * u)
  ctx.stroke()
}

/** Splits words into n lines, keeping the widest line as narrow as possible. */
function splitLines(ctx: Ctx, words: string[], n: number, font: string, spacing: number): string[] {
  if (n <= 1) return [words.join(' ')]
  setFont(ctx, font, spacing)
  let best: string[] = []
  let bestW = Infinity
  const walk = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')]
      const w = Math.max(...lines.map((l) => width(ctx, l, spacing)))
      if (w < bestW) {
        bestW = w
        best = lines
      }
      return
    }
    for (let i = start + 1; i <= words.length - left + 1; i++) walk(i, left - 1, [...acc, words.slice(start, i).join(' ')])
  }
  walk(0, n, [])
  return best
}

/** Octagonal cartouche, matching the template's plaques, with a vector QR inside. */
function drawQr(ctx: Ctx, t: TemplateSpec, url: string) {
  const { cx, cy, frame, chamfer, fill, stroke, panel, module } = t.qr
  const u = frame / 370 // proportions were drawn for the 370px frame
  const octagon = (inset: number) => {
    const x0 = cx - frame / 2 + inset, y0 = cy - frame / 2 + inset
    const x1 = cx + frame / 2 - inset, y1 = cy + frame / 2 - inset
    const c = chamfer - inset * 0.4
    ctx.beginPath()
    ctx.moveTo(x0 + c, y0)
    ctx.lineTo(x1 - c, y0)
    ctx.lineTo(x1, y0 + c)
    ctx.lineTo(x1, y1 - c)
    ctx.lineTo(x1 - c, y1)
    ctx.lineTo(x0 + c, y1)
    ctx.lineTo(x0, y1 - c)
    ctx.lineTo(x0, y0 + c)
    ctx.closePath()
  }
  if (!t.qr.frameInArt) {
    ctx.fillStyle = fill
    octagon(0)
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 6 * u
    ctx.stroke()
    ctx.lineWidth = 2 * u
    octagon(14 * u)
    ctx.stroke()
  }

  if (!url) {
    // No gift link yet: say so instead of printing a code that goes nowhere (exports are blocked too).
    ctx.fillStyle = t.ink
    setFont(ctx, t.fonts.url.replace('{s}', String(Math.round(frame * 0.085))), frame * 0.012)
    ctx.fillText('QR PENDENTE', cx, cy + frame * 0.03)
    return
  }
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const area = frame - 92 * u
  const m = area / n
  const ox = cx - area / 2
  const oy = cy - area / 2
  if (panel !== fill) {
    // Light quiet zone behind the code (dark template): two modules wide.
    ctx.fillStyle = panel
    ctx.beginPath()
    ctx.roundRect(ox - 2 * m, oy - 2 * m, area + 4 * m, area + 4 * m, 6 * u)
    ctx.fill()
  }
  ctx.fillStyle = module
  ctx.beginPath()
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c)) ctx.rect(ox + c * m - 0.25, oy + r * m - 0.25, m + 0.5, m + 0.5)
  ctx.fill()
}
