/**
 * Curved 3D arc geometry — FRONTEND_PROMPT.md §3.
 *
 * Everything here is pure math so the per-frame loop in engine.ts stays a
 * straight line of arithmetic followed by a handful of style writes.
 */

/** §3.1 Perspective constant (must match --P in index.css). */
export const PERSPECTIVE = 1400

/** Step, in px of arc length, of the screen-space integral table. */
const XS_STEP = 2

/** Volumes further than this many U along the arc are culled (§3.5 step 1). */
export const CULL_U = 1.95

/**
 * §3.2 renders 3 repetitions of the N books so the shelf can cycle forever.
 * The wrap seam sits at |rel| = 1.5N, and roughly 11.5 volumes are visible on
 * each flank before the cull, so cycling is only seamless when N >= 8. Smaller
 * sets (a narrow search result) are shown once, as a finite shelf, instead of
 * teleporting volumes across the visible arc.
 */
export const MIN_CYCLIC = 8

export const isCyclic = (n: number) => n >= MIN_CYCLIC
export const virtualCount = (n: number) => (isCyclic(n) ? n * 3 : n)

export interface ShelfGeometry {
  /** Book height in px, measured from --H. */
  H: number
  /** Spine width  w_s = H * 148 / 840. */
  ws: number
  /** Cover depth / width  d = H * 474 / 900. */
  d: number
  /** Inter-book gap  = H * 0.038. */
  gap: number
  /** Depth falloff constant  U = H * 1.32 (desktop) | H * 1.05 (mobile). */
  U: number
  /** XS[i] = ∫ scl(u) du from 0 to 2i px. */
  xs: Float32Array
  /** Screen-space x of the cull boundary, i.e. the visible half-width of the arc. */
  xMax: number
}

export function buildGeometry(H: number, mobile: boolean): ShelfGeometry {
  const ws = (H * 148) / 840
  const d = (H * 474) / 900
  const gap = H * 0.038
  const U = H * (mobile ? 1.05 : 1.32)

  // §3.4 — XS lookup: the integral of scl(u) from 0 to 3U in 2px steps.
  // The spec's Σ form starts the sum at i = 0, which would make XS[0] = 2 and
  // put a 4px jump in x_sc at u = 0 (right under the active volume). The table
  // is therefore accumulated as a trapezoid integral with XS[0] = 0 and read
  // back with linear interpolation, which is the same curve minus the seam.
  const count = Math.ceil((3 * U) / XS_STEP) + 2
  const xs = new Float32Array(count)
  let prev = 1
  for (let i = 1; i < count; i++) {
    const cur = 1 / (1 + Math.pow((i * XS_STEP) / U, 1.6))
    xs[i] = xs[i - 1] + ((prev + cur) * XS_STEP) / 2
    prev = cur
  }

  const geo: ShelfGeometry = { H, ws, d, gap, U, xs, xMax: 0 }
  geo.xMax = xsc(geo, CULL_U * U)
  return geo
}

/** §3.2 — relative index of virtual book v for cursor s across 3N virtual books. */
export function rel(v: number, s: number, n: number): number {
  const span = 3 * n
  const a = (v - s + 1.5 * n) % span
  return (a < 0 ? a + span : a) - 1.5 * n
}

/** §3.3 — smooth parting profile around the active volume. */
export function B(r: number): number {
  if (r >= 1) return 0.5
  if (r <= -1) return -0.5
  return (r + Math.sin(Math.PI * r) / Math.PI) / 2
}

/** §3.3 — physical arc length from the shelf centre for relative index r. */
export function F(g: ShelfGeometry, r: number): number {
  return r * (g.ws + g.gap) + (g.d - g.ws + 1.4 * g.gap) * B(r)
}

/** §3.4 — apparent scale at arc distance u. */
export function scl(g: ShelfGeometry, u: number): number {
  return 1 / (1 + Math.pow(Math.abs(u) / g.U, 1.6))
}

/** §3.4 — screen coordinate for arc distance u. */
export function xsc(g: ShelfGeometry, u: number): number {
  const a = Math.abs(u) / XS_STEP
  const i = Math.min(Math.floor(a), g.xs.length - 2)
  const f = Math.min(1, a - i)
  const x = g.xs[i] + (g.xs[i + 1] - g.xs[i]) * f
  return u < 0 ? -x : x
}
