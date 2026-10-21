// Generates the letter paper (A4 portrait at 300 dpi) in the three map styles:
// public/letter-white.jpg, letter-dark.jpg, letter-color.jpg.
// Paper = multi-scale noise for the fibre texture, faint stray fibres, two compass
// roses as watermarks (top-left and bottom-right, partly off the page, like the
// reference in scripts/letter-reference.png) and, on the colour paper, a soft vignette.
// Usage: node scripts/make-letter-paper.mjs
import sharp from 'sharp'

const W = 2480
const H = 3508

const STYLES = {
  // Same light parchment as the colour map, with its thin border and four-point corner stars.
  color: { base: [233, 219, 190], noise: 9, fibre: '#7a6040', fibreOpacity: 0.06, rose: '#8a6a3a', roseOpacity: 0.12, vignette: 0.16, vignetteColor: '#6b4a1e', frame: '#3a3226' },
  white: { base: [230, 229, 224], noise: 6, fibre: '#55544f', fibreOpacity: 0.04, rose: '#5a5a55', roseOpacity: 0.07, vignette: 0.06 },
  dark: { base: [20, 20, 20], noise: 5, fibre: '#f5f5f2', fibreOpacity: 0.035, rose: '#f5f5f2', roseOpacity: 0.05, vignette: 0 },
  // The coin track: flat black and white, no parchment fibre and no compass roses. Its detail is
  // technical instead — a hairline frame, corner crosshairs and a fine scale down the two sides.
  // The little noise left only keeps a flat tint from banding in print.
  'coin-white': { base: [246, 246, 244], noise: 2.5, tech: '#161616', techOpacity: 0.5 },
  'coin-dark': { base: [10, 10, 10], noise: 2.5, tech: '#f5f5f2', techOpacity: 0.42 },
}

// Seeded random so every build gives the same paper.
let seed = 7
const rand = () => {
  // mulberry32: an LCG here left visible horizontal stripes in the grain.
  seed = (seed + 0x6d2b79f5) | 0
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

async function noiseLayer(w, h) {
  const buf = Buffer.alloc(w * h)
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(rand() * 256)
  // Blur after upscaling by about half a cell so the coarse layers have no visible block seams.
  const sigma = Math.max(0.3, (W / w) * 0.5)
  return sharp(buf, { raw: { width: w, height: h, channels: 1 } }).resize(W, H, { kernel: 'cubic' }).blur(sigma).extractChannel(0).raw().toBuffer()
}

function compassRose(cx, cy, r, color, opacity) {
  const parts = []
  for (const k of [1, 0.93, 0.62, 0.56]) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="${color}" stroke-width="${k > 0.9 ? 5 : 3}"/>`)
  // 32 rhumb lines, then a 16-point star.
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}" stroke="${color}" stroke-width="2"/>`)
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const len = i % 4 === 0 ? r * 0.92 : i % 2 === 0 ? r * 0.66 : r * 0.45
    const w = i % 4 === 0 ? r * 0.09 : r * 0.06
    const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len]
    const l = [cx + Math.cos(a - Math.PI / 2) * w, cy + Math.sin(a - Math.PI / 2) * w]
    const rr = [cx + Math.cos(a + Math.PI / 2) * w, cy + Math.sin(a + Math.PI / 2) * w]
    parts.push(`<polygon points="${l.join(',')} ${tip.join(',')} ${rr.join(',')}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="3"/>`)
  }
  return `<g opacity="${opacity}">${parts.join('')}</g>`
}

/** The map's border: a thin line inset from the edge, a hollow four-point star at each corner. */
function frame(color) {
  const inset = 70, r = 30, gap = 22
  const star = (cx, cy) => {
    const k = r * 0.16
    return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`
  }
  const a = inset, b = inset + r + gap
  const lines = [
    [b, a, W - b, a], [b, H - a, W - b, H - a], // top, bottom
    [a, b, a, H - b], [W - a, b, W - a, H - b], // left, right
  ].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3"/>`)
  return `<g opacity="0.85">${lines.join('')}${star(a, a)}${star(W - a, a)}${star(a, H - a)}${star(W - a, H - a)}</g>`
}

/**
 * The coin paper's detail: a hairline frame, a crosshair at each corner where the rules would meet,
 * and a fine scale down the left and right edges. Drawn, not photographed: nothing here is aged.
 */
function techMarks(color, opacity) {
  const inset = 96, arm = 34, gap = 14
  const parts = [
    `<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" fill="none" stroke="${color}" stroke-width="2"/>`,
  ]
  for (const [cx, cy] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
    parts.push(`<line x1="${cx - arm}" y1="${cy}" x2="${cx + arm}" y2="${cy}" stroke="${color}" stroke-width="2"/>`)
    parts.push(`<line x1="${cx}" y1="${cy - arm}" x2="${cx}" y2="${cy + arm}" stroke="${color}" stroke-width="2"/>`)
  }
  // Every fifth tick is longer, so the scale reads as a measure and not as a dotted border.
  for (let i = 1, y = inset + 150; y < H - inset - 150; i++, y += 56) {
    const len = i % 5 === 0 ? 26 : 13
    parts.push(`<line x1="${inset + gap}" y1="${y}" x2="${inset + gap + len}" y2="${y}" stroke="${color}" stroke-width="1.6"/>`)
    parts.push(`<line x1="${W - inset - gap - len}" y1="${y}" x2="${W - inset - gap}" y2="${y}" stroke="${color}" stroke-width="1.6"/>`)
  }
  return `<g opacity="${opacity}">${parts.join('')}</g>`
}

function fibres(color, opacity) {
  const paths = []
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W, y = rand() * H
    const len = 20 + rand() * 90
    const a = rand() * Math.PI * 2
    const bend = (rand() - 0.5) * len * 0.8
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len
    const mx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * bend, my = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * bend
    paths.push(`<path d="M${x.toFixed(0)} ${y.toFixed(0)} Q${mx.toFixed(0)} ${my.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke-width="${(1 + rand() * 1.6).toFixed(1)}"/>`)
  }
  return `<g fill="none" stroke="${color}" opacity="${opacity}">${paths.join('')}</g>`
}

const layers = await Promise.all([noiseLayer(31, 44), noiseLayer(124, 175), noiseLayer(620, 877), noiseLayer(W, H)])
const weights = [0.45, 0.25, 0.18, 0.12]

for (const [name, s] of Object.entries(STYLES)) {
  const img = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    let n = 0
    for (let k = 0; k < 4; k++) n += (layers[k][i] / 255 - 0.5) * weights[k]
    const d = n * s.noise * 2.4
    img[i * 3] = Math.max(0, Math.min(255, s.base[0] + d))
    img[i * 3 + 1] = Math.max(0, Math.min(255, s.base[1] + d * 1.05))
    img[i * 3 + 2] = Math.max(0, Math.min(255, s.base[2] + d * 1.15))
  }
  const vignette = s.vignette
    ? `<defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="${s.vignetteColor ?? '#5a3510'}" stop-opacity="0"/><stop offset="100%" stop-color="${s.vignetteColor ?? '#5a3510'}" stop-opacity="${s.vignette}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/>`
    : ''
  const layersSvg = [
    s.fibreOpacity ? fibres(s.fibre, s.fibreOpacity) : '',
    s.rose ? compassRose(260, 230, 760, s.rose, s.roseOpacity) + compassRose(2380, 3330, 1150, s.rose, s.roseOpacity) : '',
    vignette,
    s.frame ? frame(s.frame) : '',
    s.tech ? techMarks(s.tech, s.techOpacity) : '',
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${layersSvg}</svg>`
  await sharp(img, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(`public/letter-${name}.jpg`)
  console.log('wrote', `public/letter-${name}.jpg`)
}
