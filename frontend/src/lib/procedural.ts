/**
 * Procedural bindings — FRONTEND_PROMPT.md §7.3.
 *
 * 1. makeSpineStyle(): books added through /api/addBook carry a front-cover
 *    image but no spine artwork, so every spine is synthesised: a deep cloth or
 *    leather colour chosen deterministically from the title hash, a foil colour
 *    for the vertical lettering, and a number of raised bands. The CSS in
 *    index.css turns these few values into weave, ribbing and embossing.
 *
 * 2. makeCoverSvg(): a mid-century style cover drawn as an SVG data URI. It is
 *    the artwork of the built-in specimen folios, and the stand-in layered
 *    underneath any backend cover whose image fails to load.
 *
 * Extension point (§9.2 "Procedural Foil & Ribbing Customizer"): CLOTHS and
 * FOILS below are the palettes a future add-book form would expose as
 * Buckram / Moroccan Leather / Washi and Gold Leaf / Blind Deboss / White Pigment.
 */
import type { ClothKind, FoilKind, SpineStyle } from '../types'
import { hash32, seededRandom } from './math'

interface Cloth {
  cloth: string
  deep: string
  kind: ClothKind
}

export const CLOTHS: Cloth[] = [
  { cloth: '#5B1F1A', deep: '#2A0D0A', kind: 'morocco' }, // 0 oxblood
  { cloth: '#1F3A2E', deep: '#0D1A14', kind: 'buckram' }, // 1 forest
  { cloth: '#1B2A4A', deep: '#0B1222', kind: 'buckram' }, // 2 navy
  { cloth: '#4A3423', deep: '#20160E', kind: 'morocco' }, // 3 umber
  { cloth: '#2B3138', deep: '#111418', kind: 'buckram' }, // 4 slate
  { cloth: '#3B2440', deep: '#190F1C', kind: 'morocco' }, // 5 aubergine
  { cloth: '#6A4B1E', deep: '#2E200C', kind: 'buckram' }, // 6 dark ochre
  { cloth: '#1E4347', deep: '#0C1D1F', kind: 'buckram' }, // 7 deep teal
  { cloth: '#1E232A', deep: '#0C0E11', kind: 'buckram' }, // 8 --cloth-dark
  { cloth: '#70291F', deep: '#33110C', kind: 'morocco' }, // 9 vermilion brown
  { cloth: '#D8D0BC', deep: '#8E8674', kind: 'washi' }, // 10 washi cream
  { cloth: '#C9C2B2', deep: '#857E6F', kind: 'washi' }, // 11 bone
]

export const FOILS: Record<FoilKind, { foil: string; hi: string }> = {
  gold: { foil: '#C8A45D', hi: '#F1DFA9' },
  cobalt: { foil: '#1F3FB0', hi: '#4D6EE6' },
  blind: { foil: '#141414', hi: '#3A3A3A' },
  white: { foil: '#E9E4D8', hi: '#FFFFFF' },
}

export function makeSpineStyle(title: string, pick?: { cloth?: number; foil?: FoilKind; bands?: number }): SpineStyle {
  const h = hash32(title.trim().toLowerCase())
  const cloth = CLOTHS[pick?.cloth ?? h % CLOTHS.length]
  let foilKind: FoilKind
  if (pick?.foil) foilKind = pick.foil
  else if (cloth.kind === 'washi') foilKind = (h >>> 8) % 3 === 0 ? 'blind' : 'cobalt'
  else foilKind = (h >>> 8) % 5 === 0 ? 'white' : 'gold'
  const foil = FOILS[foilKind]
  return {
    cloth: cloth.cloth,
    clothDeep: cloth.deep,
    kind: cloth.kind,
    foil: foil.foil,
    foilHi: foil.hi,
    foilKind,
    bands: pick?.bands ?? 1 + ((h >>> 12) % 3),
  }
}

/* -------------------------------------------------------------------------- */
/* Cover artwork                                                              */
/* -------------------------------------------------------------------------- */

export interface CoverPalette {
  bg: string
  ink: string
  accent: string
  accent2: string
}

export type Motif =
  | 'sun'
  | 'waves'
  | 'peaks'
  | 'rings'
  | 'grid'
  | 'bars'
  | 'arcs'
  | 'moon'
  | 'rays'
  | 'horizon'
  | 'rooms'
  | 'tide'
  | 'moths'

type Rand = () => number
type MotifFn = (p: CoverPalette, rnd: Rand) => string

const n1 = (v: number) => v.toFixed(1)

const MOTIFS: Record<Motif, MotifFn> = {
  sun: (p) =>
    `<circle cx="237" cy="322" r="160" fill="${p.accent}"/>` +
    `<rect y="470" width="474" height="16" fill="${p.ink}"/><rect y="504" width="474" height="9" fill="${p.ink}"/>` +
    `<rect y="530" width="474" height="5" fill="${p.ink}"/><rect y="552" width="474" height="2" fill="${p.ink}"/>` +
    `<circle cx="384" cy="150" r="24" fill="${p.accent2}"/>`,

  waves: (p) => {
    const colors = [p.accent, p.ink, p.accent2]
    let out = ''
    for (let i = 0; i < 9; i++) {
      const y = 160 + i * 50
      const dir = i % 2 ? 34 : -34
      out += `<path d="M-20 ${y} q 64 ${dir} 128 0 t 128 0 t 128 0 t 128 0" fill="none" stroke="${colors[i % 3]}" stroke-width="${i % 3 === 1 ? 6 : 18}" stroke-linecap="round"/>`
    }
    return out
  },

  peaks: (p) =>
    `<circle cx="112" cy="196" r="46" fill="${p.accent2}"/>` +
    `<polygon points="-10,600 150,270 318,600" fill="${p.accent2}" opacity="0.55"/>` +
    `<polygon points="110,600 312,176 484,540 484,600" fill="${p.accent}"/>` +
    `<polygon points="246,600 398,372 484,486 484,600" fill="${p.ink}"/>` +
    `<rect y="596" width="474" height="6" fill="${p.ink}"/>`,

  rings: (p) => {
    let out = ''
    for (let r = 280; r >= 70; r -= 35) out += `<circle cx="300" cy="330" r="${r}" fill="none" stroke="${p.ink}" stroke-width="5"/>`
    return out + `<circle cx="300" cy="330" r="38" fill="${p.accent}"/><circle cx="118" cy="520" r="54" fill="${p.accent2}"/>`
  },

  grid: (p, rnd) => {
    let out = ''
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 38 + col * 82
        const y = 118 + row * 82
        const pick = rnd()
        if (pick < 0.26) out += `<rect x="${x}" y="${y}" width="70" height="70" fill="${p.accent}"/>`
        else if (pick < 0.4) out += `<circle cx="${x + 35}" cy="${y + 35}" r="35" fill="${p.accent2}"/>`
        else if (pick < 0.52) out += `<rect x="${x}" y="${y}" width="70" height="70" fill="${p.ink}"/>`
        else out += `<rect x="${x + 1.5}" y="${y + 1.5}" width="67" height="67" fill="none" stroke="${p.ink}" stroke-width="3"/>`
      }
    }
    return out
  },

  bars: (p, rnd) => {
    const colors = [p.ink, p.accent, p.ink, p.accent2]
    let out = ''
    for (let i = 0; i < 11; i++) {
      const h = 110 + rnd() * 360
      out += `<rect x="${40 + i * 36.4}" y="${n1(600 - h)}" width="22" height="${n1(h)}" fill="${colors[i % 4]}"/>`
    }
    return out + `<rect x="38" y="600" width="398" height="5" fill="${p.ink}"/>`
  },

  arcs: (p, rnd) => {
    const colors = [p.accent, p.ink, p.accent2, p.accent]
    let out = ''
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 17 + col * 110
        const y = 130 + row * 110
        const corner = Math.floor(rnd() * 4)
        const cx = x + (corner % 2) * 110
        const cy = y + (corner > 1 ? 110 : 0)
        const sx = corner % 2 ? -1 : 1
        const sy = corner > 1 ? -1 : 1
        out += `<path d="M${cx} ${cy} h${110 * sx} a110 110 0 0 ${sx * sy > 0 ? 1 : 0} ${-110 * sx} ${110 * sy} z" fill="${colors[(row + col + corner) % 4]}"/>`
      }
    }
    return out
  },

  moon: (p, rnd) => {
    let out = ''
    for (let i = 0; i < 46; i++) {
      out += `<circle cx="${n1(20 + rnd() * 434)}" cy="${n1(112 + rnd() * 480)}" r="${n1(1.2 + rnd() * 2.6)}" fill="${p.ink}"/>`
    }
    return (
      out +
      `<circle cx="236" cy="330" r="150" fill="${p.accent}"/><circle cx="296" cy="286" r="132" fill="${p.bg}"/>` +
      `<rect y="566" width="474" height="5" fill="${p.accent2}"/>`
    )
  },

  rays: (p) => {
    let out = ''
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (1 + i / 16)
      out += `<line x1="237" y1="590" x2="${n1(237 + Math.cos(a) * 620)}" y2="${n1(590 + Math.sin(a) * 620)}" stroke="${i % 4 === 0 ? p.accent2 : p.ink}" stroke-width="${i % 4 === 0 ? 9 : 4}"/>`
    }
    return out + `<circle cx="237" cy="590" r="104" fill="${p.accent}"/><rect y="590" width="474" height="40" fill="${p.bg}"/><rect y="590" width="474" height="6" fill="${p.ink}"/>`
  },

  horizon: (p) => {
    let out = `<circle cx="336" cy="372" r="86" fill="${p.accent}"/><rect y="380" width="474" height="240" fill="${p.bg}"/>`
    for (let i = 0; i < 9; i++) out += `<rect y="${380 + i * i * 2.6 + i * 6}" width="474" height="${n1(2 + i * 1.5)}" fill="${p.ink}"/>`
    return (
      out +
      `<rect x="96" y="358" width="92" height="20" fill="${p.accent2}"/><rect x="118" y="342" width="40" height="16" fill="${p.accent2}"/>` +
      `<rect x="140" y="322" width="9" height="20" fill="${p.accent2}"/>`
    )
  },

  rooms: (p) => {
    let out = ''
    for (let i = 0; i < 6; i++) {
      const inset = i * 31
      out += `<rect x="${57 + inset}" y="${126 + inset * 1.24}" width="${360 - inset * 2}" height="${468 - inset * 2.48}" fill="${i === 3 ? p.accent : 'none'}" stroke="${p.ink}" stroke-width="5"/>`
    }
    return out + `<rect x="222" y="330" width="30" height="62" fill="${p.accent2}"/>`
  },

  tide: (p) => {
    const colors = [p.accent, p.ink, p.accent, p.accent2]
    let out = ''
    for (let i = 0; i < 16; i++) {
      out += `<rect x="${-320 + i * 62}" y="-80" width="${i % 4 === 1 ? 8 : 30}" height="900" transform="rotate(24 237 350)" fill="${colors[i % 4]}"/>`
    }
    return out
  },

  moths: (p, rnd) => {
    const colors = [p.accent, p.ink, p.accent2]
    let out = ''
    for (let i = 0; i < 11; i++) {
      const x = 60 + (i % 3) * 150 + rnd() * 60
      const y = 150 + Math.floor(i / 3) * 122 + rnd() * 46
      const s = 0.7 + rnd() * 0.75
      const c = colors[i % 3]
      out +=
        `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rnd() * 360)}) scale(${s.toFixed(2)})">` +
        `<polygon points="0,0 -42,-30 -34,26" fill="${c}"/><polygon points="0,0 42,-30 34,26" fill="${c}"/>` +
        `<rect x="-2.5" y="-24" width="5" height="46" fill="${p.ink}"/></g>`
    }
    return out
  },
}

const MOTIF_NAMES = Object.keys(MOTIFS) as Motif[]

const PALETTES: CoverPalette[] = [
  { bg: '#E4DCCB', ink: '#16181D', accent: '#B4432E', accent2: '#5C6B3C' },
  { bg: '#D6DCE0', ink: '#1A2233', accent: '#1F3FB0', accent2: '#C99A2E' },
  { bg: '#1B2A4A', ink: '#EDE6D6', accent: '#E3C06A', accent2: '#B4432E' },
  { bg: '#D9D0BA', ink: '#2B2118', accent: '#C99A2E', accent2: '#7A3E28' },
  { bg: '#1E4347', ink: '#EFE8D8', accent: '#E0B04C', accent2: '#D8D0BC' },
  { bg: '#CBD2C0', ink: '#1C2A22', accent: '#3F6B52', accent2: '#B4432E' },
]

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Greedy word wrap for the cover title block. */
function wrapTitle(title: string, maxChars: number, maxLines: number): string[] {
  const words = title.toUpperCase().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (!line) line = word
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines)
    head[maxLines - 1] = head[maxLines - 1].replace(/.{0,2}$/, '') + '…'
    return head
  }
  return lines
}

export interface CoverSpec {
  title: string
  author: string
  jp?: string
  year?: number
  /** Catalogue number printed in the header band. */
  no?: number
  palette: CoverPalette
  motif: Motif
  seed: number
}

const SANS = `'Helvetica Neue',Helvetica,Arial,sans-serif`

export function makeCoverSvg(spec: CoverSpec): string {
  const { palette: p } = spec
  const rnd = seededRandom(spec.seed)
  const lines = wrapTitle(spec.title, 14, 4)
  const longest = Math.max(1, ...lines.map((l) => l.length))
  const width = 396
  const fs = Math.max(26, Math.min(60, width / (longest * 0.62)))
  const lineH = fs * 0.98
  const baseY = 792
  const titleTop = baseY - (lines.length - 1) * lineH - fs
  const artBottom = Math.min(622, titleTop - 26)

  const header = [spec.no ? `NO. ${String(spec.no).padStart(2, '0')}` : 'FOLIO', spec.year ? String(spec.year) : '']
    .filter(Boolean)
    .join(' · ')

  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="38" y="${n1(baseY - (lines.length - 1 - i) * lineH)}" font-family="${SANS}" font-weight="700" font-size="${n1(fs)}" letter-spacing="${n1(-fs * 0.02)}" fill="${p.ink}">${xml(l)}</text>`,
    )
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 474 900" width="474" height="900">` +
    `<defs><clipPath id="art"><rect x="0" y="100" width="474" height="${n1(artBottom - 100)}"/></clipPath></defs>` +
    `<rect width="474" height="900" fill="${p.bg}"/>` +
    `<text x="38" y="62" font-family="${SANS}" font-weight="700" font-size="12.5" letter-spacing="3.2" fill="${p.ink}">BIBLIOTHECA OBSCURA</text>` +
    `<text x="436" y="62" text-anchor="end" font-family="${SANS}" font-weight="500" font-size="12.5" letter-spacing="2.4" fill="${p.ink}">${xml(header)}</text>` +
    `<rect x="38" y="78" width="398" height="2.5" fill="${p.ink}"/>` +
    `<g clip-path="url(#art)">${MOTIFS[spec.motif](p, rnd)}</g>` +
    titleSvg +
    `<rect x="38" y="822" width="56" height="3" fill="${p.accent}"/>` +
    `<text x="38" y="852" font-family="${SANS}" font-weight="500" font-size="15.5" letter-spacing="2.8" fill="${p.ink}">${xml(spec.author.toUpperCase().slice(0, 34))}</text>` +
    `</svg>`
  )
}

export const svgToDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Hash-driven cover for any title — used when a backend cover image cannot be loaded. */
export function proceduralCover(title: string, author: string): string {
  const h = hash32(`${title}|${author}`.toLowerCase())
  return svgToDataUri(
    makeCoverSvg({
      title,
      author,
      palette: PALETTES[h % PALETTES.length],
      motif: MOTIF_NAMES[(h >>> 6) % MOTIF_NAMES.length],
      seed: h,
    }),
  )
}
