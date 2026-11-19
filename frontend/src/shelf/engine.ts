/**
 * ShelfEngine — the isolated DOM controller behind the curved shelf.
 *
 * One requestAnimationFrame loop owns every moving part of the hero (book
 * transforms, shading, hover lift, cover tilt, contact shadow, timeline dot)
 * and writes straight to element styles. React renders the book nodes once per
 * catalogue and is never involved in a frame (FRONTEND_PROMPT.md §3–§4, §10).
 */
import { clamp, mod, smoothstep } from '../lib/math'
import {
  CULL_U,
  F,
  PERSPECTIVE,
  buildGeometry,
  isCyclic,
  rel,
  scl,
  xsc,
  type ShelfGeometry,
} from './geometry'

/** §4.1 spring constants. */
const K_IDLE = 5.2
const K_DRAG = 18.0
const DT_MAX = 0.05
/** §3.6 hover lift and §4.2 tilt easing rates. */
const K_LIFT = 12
const K_TILT = 7
/** Virtual volumes examined on each side of the cursor per frame (cull is ~11.6). */
const WINDOW = 15
/** Pointer travel (px) before a press becomes a drag instead of a click. */
const DRAG_SLOP = 6
/** §4.3 wheel idle timeout before T snaps to an integer volume. */
const WHEEL_IDLE_MS = 150
/** Books advanced per pixel of wheel delta. */
const WHEEL_GAIN = 0.0065
const SPOOL_IN_S = 0.95
const SPOOL_OUT_S = 0.42

export interface EngineCallbacks {
  /** The volume nearest the centre changed (index into the N real books). */
  onActive?: (index: number) => void
  /** The active cover was clicked / Enter was pressed. */
  onOpen?: (index: number) => void
  /** A volume passed the centre while scrubbing — used for the acoustic click. */
  onStep?: () => void
}

export interface TimelineLink {
  dot: HTMLElement
  track: HTMLElement
  /** Position of each real book along the track, 0…1. */
  fracs: number[]
}

interface BookRefs {
  box: HTMLElement
  spShade: HTMLElement
  cvShade: HTMLElement
  cover: HTMLElement
}

const isTypingTarget = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
}

export class ShelfEngine {
  private readonly stage: HTMLElement
  private readonly cb: EngineCallbacks
  private readonly shadow: HTMLElement | null
  private readonly probe: HTMLElement | null
  private readonly mobileQuery = window.matchMedia('(max-width: 768px)')
  private readonly resizeObserver: ResizeObserver

  private geo: ShelfGeometry | null = null
  private W = 0
  private cy = 0

  // Catalogue binding
  private refs: BookRefs[] = []
  private n = 0
  private total = 0
  private cyclic = true
  private lift = new Float32Array(0)
  private stamp = new Int32Array(0)
  private visible: number[] = []
  private frameId = 0

  // §4.1 spring state: float cursor s chasing target T
  private s = 0
  private T = 0
  private active = -1

  // Entrance / exit ("re-spooling") scalar
  private spool = 0
  private spoolTarget = 1
  private spoolResolve: (() => void) | null = null

  // Input state
  private frozen = false
  private dragging = false
  private down: { id: number; x: number; v: number } | null = null
  private dragT0 = 0
  private samples: { t: number; T: number }[] = []
  private wheelTimer = 0
  private wheelRest: number | null = null
  private hoverV = -1
  private mx = 0
  private my = 0
  private hasMouse = false
  private tiltX = 0
  private tiltY = 0

  private timeline: TimelineLink | null = null
  private trackW = 0

  private raf = 0
  private last = 0
  private force = true
  private liftBusy = false

  constructor(stage: HTMLElement, cb: EngineCallbacks) {
    this.stage = stage
    this.cb = cb
    this.shadow = stage.querySelector<HTMLElement>('.contact-shadow')
    this.probe = stage.querySelector<HTMLElement>('.shelf-probe')

    stage.addEventListener('pointerdown', this.onPointerDown)
    stage.addEventListener('pointermove', this.onPointerMove)
    stage.addEventListener('pointerup', this.onPointerUp)
    stage.addEventListener('pointercancel', this.onPointerCancel)
    stage.addEventListener('pointerleave', this.onPointerLeave)
    stage.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: true })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.measure)
    this.resizeObserver = new ResizeObserver(this.measure)
    this.resizeObserver.observe(stage)

    this.measure()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.wheelTimer)
    this.resizeObserver.disconnect()
    const stage = this.stage
    stage.removeEventListener('pointerdown', this.onPointerDown)
    stage.removeEventListener('pointermove', this.onPointerMove)
    stage.removeEventListener('pointerup', this.onPointerUp)
    stage.removeEventListener('pointercancel', this.onPointerCancel)
    stage.removeEventListener('pointerleave', this.onPointerLeave)
    stage.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointermove', this.onWindowPointerMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('resize', this.measure)
    this.spoolResolve?.()
    this.spoolResolve = null
  }

  /* ------------------------------------------------------------------ */
  /* Public control surface                                              */
  /* ------------------------------------------------------------------ */

  /** (Re)bind to the book nodes React just rendered and centre `index`. */
  bind(count: number, index = 0) {
    const boxes = Array.from(this.stage.querySelectorAll<HTMLElement>('.book-box'))
    this.refs = boxes.map((box) => ({
      box,
      spShade: box.querySelector<HTMLElement>('.sp .shade-overlay')!,
      cvShade: box.querySelector<HTMLElement>('.cv .shade-overlay')!,
      cover: box.querySelector<HTMLElement>('.cv')!,
    }))
    // Nodes may be reused across catalogues; start every one culled (CSS default).
    for (const box of boxes) box.style.display = ''
    this.n = count
    this.total = boxes.length
    this.cyclic = isCyclic(count) && this.total === count * 3
    this.lift = new Float32Array(this.total)
    this.stamp = new Int32Array(this.total).fill(-1)
    this.visible = []
    this.s = this.T = count > 0 ? clamp(Math.round(index), 0, count - 1) : 0
    this.active = -1
    this.hoverV = -1
    this.down = null
    this.dragging = false
    this.wheelRest = null
    this.spool = 0
    this.spoolTarget = 1
    this.force = true
  }

  /** Sink the current volumes back into the floor; resolves when they are gone. */
  spoolOut(): Promise<void> {
    if (this.n === 0 || this.spool <= 0) return Promise.resolve()
    this.spoolResolve?.()
    this.spoolTarget = 0
    return new Promise((resolve) => {
      this.spoolResolve = resolve
    })
  }

  setTimeline(link: TimelineLink | null) {
    this.timeline = link
    this.trackW = link ? link.track.clientWidth : 0
    this.force = true
  }

  /** §8 DETAIL OPEN — freeze T and ignore shelf input while the folio is out. */
  setFrozen(frozen: boolean) {
    this.frozen = frozen
    if (frozen) {
      this.endDrag(false)
      this.T = this.clampT(Math.round(this.T))
      this.hoverV = -1
    }
    this.force = true
  }

  step(delta: number) {
    if (this.frozen || this.n === 0) return
    this.T = this.clampT(Math.round(this.T) + delta)
  }

  /**
   * Glide to real book `index`, taking the shorter way round a cyclic shelf.
   * Programmatic (catalogue index, timeline), so it is not blocked by the input freeze.
   */
  goTo(index: number) {
    if (this.n === 0) return
    const base = Math.round(this.T)
    let delta = index - mod(base, this.n)
    if (this.cyclic) {
      if (delta > this.n / 2) delta -= this.n
      else if (delta < -this.n / 2) delta += this.n
    }
    this.T = this.clampT(base + delta)
  }

  isSettled() {
    return Math.abs(this.T - this.s) < 0.25
  }

  /** The `.cv` face of the volume currently at the centre of the arc. */
  getActiveCover(): HTMLElement | null {
    if (this.n === 0) return null
    return this.refs[this.centreV()]?.cover ?? null
  }

  /* ------------------------------------------------------------------ */
  /* Measurement                                                         */
  /* ------------------------------------------------------------------ */

  private measure = () => {
    const stage = this.stage
    // --H and --cy are resolved by the browser on a hidden probe, so the CSS
    // tokens (including the mobile overrides and svh units) stay the source of truth.
    const H = this.probe?.offsetHeight || Math.min(window.innerHeight * 0.48, window.innerWidth * 0.34)
    this.cy = this.probe?.offsetTop ?? window.innerHeight * 0.42
    this.W = stage.clientWidth
    const geo = buildGeometry(H, this.mobileQuery.matches)
    this.geo = geo
    stage.style.setProperty('--Hpx', `${geo.H.toFixed(2)}px`)
    stage.style.setProperty('--ws', `${geo.ws.toFixed(2)}px`)
    stage.style.setProperty('--d', `${geo.d.toFixed(2)}px`)
    stage.style.setProperty('--xmax', `${geo.xMax.toFixed(1)}px`)
    if (this.timeline) this.trackW = this.timeline.track.clientWidth
    this.force = true
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    // §4.1 — dt clamped so a refocused tab cannot tunnel the spring.
    const dt = clamp((now - this.last) / 1000, 0, DT_MAX)
    this.last = now
    const g = this.geo
    if (!g || this.n === 0) return

    // §4.1 — exponential relaxation spring: s ← s + (T − s)(1 − e^(−k·dt))
    const before = this.s
    this.s += (this.T - this.s) * (1 - Math.exp(-(this.dragging ? K_DRAG : K_IDLE) * dt))
    if (Math.abs(this.T - this.s) < 1e-4) this.s = this.T
    let dirty = this.force || this.s !== before

    // §4.1 — virtual wrap: shift s and T together by whole multiples of N.
    if (this.cyclic && (this.s >= this.n || this.s < 0)) {
      const shift = Math.floor(this.s / this.n) * this.n
      this.s -= shift
      this.T -= shift
      this.dragT0 -= shift
      if (this.wheelRest !== null) this.wheelRest -= shift
      for (const sample of this.samples) sample.T -= shift
    }

    const active = mod(Math.round(this.s), this.n)
    if (active !== this.active) {
      const first = this.active === -1
      this.active = active
      this.cb.onActive?.(active)
      if (!first) this.cb.onStep?.()
    }

    // §4.2 — mouse tilt, only once the active volume has settled.
    let tiltXTarget = 0
    let tiltYTarget = 0
    if (this.hasMouse && !this.frozen && !this.dragging && this.spool >= 1 && this.isSettled()) {
      const dx = this.mx - this.W / 2
      const dy = this.my - this.cy
      if (Math.abs(dx) <= 0.55 * g.d && Math.abs(dy) <= 0.55 * g.H) {
        tiltYTarget = (dx / (0.55 * g.d)) * 9
        tiltXTarget = clamp((-dy / (g.H / 2)) * 6, -6, 6)
      }
    }
    const tiltEase = 1 - Math.exp(-K_TILT * dt)
    const tx = this.tiltX + (tiltXTarget - this.tiltX) * tiltEase
    const ty = this.tiltY + (tiltYTarget - this.tiltY) * tiltEase
    if (Math.abs(tx - this.tiltX) > 1e-4 || Math.abs(ty - this.tiltY) > 1e-4) dirty = true
    this.tiltX = Math.abs(tx) < 1e-4 && tiltXTarget === 0 ? 0 : tx
    this.tiltY = Math.abs(ty) < 1e-4 && tiltYTarget === 0 ? 0 : ty

    // Re-spool scalar (catalogue entrance / exit).
    if (this.spool !== this.spoolTarget) {
      const dir = this.spoolTarget > this.spool ? 1 : -1
      this.spool = clamp(this.spool + (dir * dt) / (dir > 0 ? SPOOL_IN_S : SPOOL_OUT_S), 0, 1)
      dirty = true
      if (this.spool === this.spoolTarget && this.spoolResolve) {
        const resolve = this.spoolResolve
        this.spoolResolve = null
        resolve()
      }
    }

    if (!dirty && !this.liftBusy) return
    this.force = false
    this.render(g, dt)
  }

  private render(g: ShelfGeometry, dt: number) {
    const { H, U } = g
    const s = this.s
    const center = Math.round(s)
    const half = this.cyclic ? Math.min(WINDOW, Math.floor((this.total - 1) / 2)) : WINDOW
    const liftEase = 1 - Math.exp(-K_LIFT * dt)
    const frameId = ++this.frameId
    const nowVisible: number[] = []
    let liftBusy = false
    let oMax = 0

    for (let i = -half; i <= half; i++) {
      let v: number
      let r: number
      if (this.cyclic) {
        v = mod(center + i, this.total)
        r = rel(v, s, this.n)
      } else {
        v = center + i
        if (v < 0 || v >= this.total) continue
        r = v - s
      }

      // §3.5.1 — arc length, cull.
      const u = F(g, r)
      const au = Math.abs(u)
      if (au > CULL_U * U) continue
      const ref = this.refs[v]
      if (!ref) continue

      // §3.5.2–3 — open scalar, apparent scale, inverse depth factor.
      const o = smoothstep(Math.max(0, 1 - Math.abs(r)))
      const sc = scl(g, u)
      const k = 1 / sc
      if (o > oMax) oMax = o

      // §3.6 — hover lift for inactive spines.
      const liftTarget = v === this.hoverV && Math.abs(r) > 0.5 && !this.dragging ? 1 : 0
      let lift = this.lift[v]
      if (lift !== liftTarget) {
        lift += (liftTarget - lift) * liftEase
        if (Math.abs(liftTarget - lift) < 0.002) lift = liftTarget
        else liftBusy = true
        this.lift[v] = lift
      }

      // §3.5.4 — translation.
      const z = PERSPECTIVE * (1 - k) + o * (H * 0.12)
      const x = xsc(g, u) * k
      const y = (H * 0.5 * (1 - sc) * 0.44 + o * (H * 0.015) - lift * (H * 0.06)) * k

      // §3.5.5 — rotation.
      const side = u > 0 ? 1 : u < 0 ? -1 : 0
      const rotY = side * Math.min(1, au / U) * 26 * (1 - o) - 90 * o + this.tiltY * o
      const rotX = this.tiltX * o

      // §3.5.6 — transform string + depth order.
      let transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)`
      if (this.spool < 1) {
        // Volumes rise out of the floor, centre first — a geometric reveal, never an opacity fade.
        const delay = 0.45 * Math.min(1, Math.abs(r) / 11)
        const t = clamp((this.spool - delay) / 0.55, 0, 1)
        const e = 1 - Math.pow(1 - t, 3)
        transform += ` translateY(${((1 - e) * H * 0.5).toFixed(2)}px) scaleY(${Math.max(e, 0.0001).toFixed(4)})`
      }
      const style = ref.box.style
      style.transform = transform
      style.zIndex = String(Math.round(3000 + z))
      if (this.stamp[v] === -1) style.display = 'block'

      // §3.6 — lighting.
      ref.spShade.style.opacity = Math.min(0.65, o * 0.55 + (1 - sc) * 0.35).toFixed(3)
      ref.cvShade.style.opacity = ((1 - o) * 0.85).toFixed(3)

      this.stamp[v] = frameId
      nowVisible.push(v)
    }

    // Hide whatever left the arc since the previous frame.
    for (const v of this.visible) {
      if (this.stamp[v] !== frameId) {
        this.stamp[v] = -1
        this.lift[v] = 0
        const ref = this.refs[v]
        if (ref) ref.box.style.display = 'none'
      }
    }
    this.visible = nowVisible
    this.liftBusy = liftBusy

    // Contact shadow: widens from spine footprint to cover footprint as the volume turns.
    if (this.shadow) {
      const grow = this.spool < 1 ? clamp(this.spool * 1.6, 0, 1) : 1
      const sx = (0.34 + 0.66 * oMax) * grow
      const sy = (0.7 + 0.3 * oMax) * grow
      this.shadow.style.transform = `translate3d(${(-this.tiltY * 0.9).toFixed(2)}px,${(this.tiltX * 0.5).toFixed(2)}px,0) scale(${sx.toFixed(3)},${sy.toFixed(3)})`
    }

    // Timeline dot interpolates between the two volumes straddling the cursor.
    const tl = this.timeline
    if (tl && tl.fracs.length === this.n) {
      const sc = this.cyclic ? s : clamp(s, 0, this.n - 1)
      const i0 = Math.floor(sc)
      const a = tl.fracs[mod(i0, this.n)]
      const b = tl.fracs[this.cyclic ? mod(i0 + 1, this.n) : Math.min(this.n - 1, i0 + 1)]
      const frac = a + (b - a) * (sc - i0)
      tl.dot.style.transform = `translate3d(${(frac * this.trackW).toFixed(2)}px,0,0)`
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */

  /** A finite (non-cyclic) shelf stops at its first and last volume. */
  private clampT(T: number, slack = 0) {
    return this.cyclic ? T : clamp(T, -slack, this.n - 1 + slack)
  }

  private relOf(v: number) {
    return this.cyclic ? rel(v, this.s, this.n) : v - this.s
  }

  /** Virtual index of the volume currently presented at the centre. */
  private centreV() {
    return this.cyclic ? mod(Math.round(this.s), this.total) : clamp(Math.round(this.s), 0, this.total - 1)
  }

  /**
   * Is the point over the presented front cover?
   *
   * The active box is rotated a full 90°, i.e. edge-on in its own plane, and
   * browsers refuse to hit-test through an edge-on preserve-3d ancestor — the
   * pointer falls straight through the cover to whatever is behind it. The
   * cover's projected rectangle is known from the geometry, so it is tested
   * analytically instead (the stage fills the viewport, so client == stage coords).
   */
  private overCover(x: number, y: number): boolean {
    const g = this.geo
    if (!g || this.n === 0 || this.spool < 1) return false
    if (Math.abs(this.s - Math.round(this.s)) > 0.22) return false
    // Presented cover plane: z = -d/2 + w_s/2 + 0.12H in front of the pivot.
    const scale = PERSPECTIVE / (PERSPECTIVE - (g.ws - g.d) / 2 - g.H * 0.12)
    return Math.abs(x - this.W / 2) <= (g.d / 2) * scale && Math.abs(y - this.cy - g.H * 0.015) <= (g.H / 2) * scale
  }

  private bookAt(e: PointerEvent): number {
    if (this.overCover(e.clientX, e.clientY)) return this.centreV()
    if (!(e.target instanceof Element)) return -1
    const box = e.target.closest<HTMLElement>('.book-box')
    return box ? Number(box.dataset.v) : -1
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.frozen || this.n === 0 || (e.pointerType === 'mouse' && e.button !== 0)) return
    this.down = { id: e.pointerId, x: e.clientX, v: this.bookAt(e) }
    this.dragT0 = this.T
    this.samples = [{ t: e.timeStamp, T: this.T }]
  }

  private onPointerMove = (e: PointerEvent) => {
    const g = this.geo
    const down = this.down
    if (down && down.id === e.pointerId && g) {
      const dx = e.clientX - down.x
      if (!this.dragging && Math.abs(dx) > DRAG_SLOP) {
        this.dragging = true
        this.hoverV = -1
        this.stage.classList.add('is-dragging')
        try {
          this.stage.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already released */
        }
      }
      if (this.dragging) {
        // §4.3 — horizontal drag scrubs proportionally to (w_s + gap).
        this.T = this.clampT(this.dragT0 - dx / (g.ws + g.gap), 0.4)
        this.samples.push({ t: e.timeStamp, T: this.T })
        if (this.samples.length > 8) this.samples.shift()
      }
      return
    }
    if (e.pointerType === 'mouse' && !this.frozen) {
      const v = this.bookAt(e)
      if (v !== this.hoverV) {
        this.hoverV = v
        this.force = true
      }
      this.stage.classList.toggle('is-over-cover', v >= 0 && v === this.centreV())
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    const down = this.down
    if (!down || down.id !== e.pointerId) return
    if (this.dragging) {
      this.endDrag(true, e.timeStamp)
      return
    }
    this.down = null
    if (this.frozen || down.v < 0) return
    // §4.3 — click: the active volume opens, any other spine glides to the centre.
    const r = this.relOf(down.v)
    if (Math.abs(r) < 0.5) {
      if (this.isSettled()) this.cb.onOpen?.(this.active)
      else this.T = this.clampT(Math.round(this.s + r))
    } else {
      this.T = this.clampT(Math.round(this.s + r))
    }
  }

  private onPointerCancel = () => this.endDrag(false)

  private onPointerLeave = () => {
    if (this.hoverV !== -1) {
      this.hoverV = -1
      this.force = true
    }
  }

  /** Release a drag: fling by the recent velocity, then snap to the nearest volume. */
  private endDrag(fling: boolean, now = 0) {
    const down = this.down
    this.down = null
    if (!this.dragging) return
    this.dragging = false
    this.stage.classList.remove('is-dragging')
    if (down) {
      try {
        this.stage.releasePointerCapture(down.id)
      } catch {
        /* capture already gone */
      }
    }
    let carry = 0
    if (fling && this.samples.length > 1) {
      const lastSample = this.samples[this.samples.length - 1]
      const ref = this.samples.find((sample) => now - sample.t <= 110) ?? lastSample
      const span = (lastSample.t - ref.t) / 1000
      if (span > 0.012 && now - lastSample.t < 60) {
        carry = clamp(((lastSample.T - ref.T) / span) * 0.2, -6, 6)
      }
    }
    this.samples = []
    this.T = this.clampT(Math.round(this.T + carry))
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (this.frozen || this.n === 0 || this.dragging) return
    // §4.3 — horizontal or vertical deltas both scrub; inertial trackpads supply the momentum.
    let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (e.deltaMode === 1) delta *= 32
    else if (e.deltaMode === 2) delta *= 320
    if (this.wheelRest === null) this.wheelRest = Math.round(this.T)
    this.T = this.clampT(this.T + clamp(delta * WHEEL_GAIN, -1.5, 1.5), 0.4)
    window.clearTimeout(this.wheelTimer)
    this.wheelTimer = window.setTimeout(this.snapWheel, WHEEL_IDLE_MS)
  }

  private snapWheel = () => {
    const rest = this.wheelRest ?? Math.round(this.T)
    this.wheelRest = null
    let snapped = Math.round(this.T)
    // A single coarse wheel notch should always advance one volume.
    if (snapped === rest && Math.abs(this.T - rest) > 0.08) snapped = rest + Math.sign(this.T - rest)
    this.T = this.clampT(snapped)
  }

  private onWindowPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.hasMouse = true
    this.mx = e.clientX
    this.my = e.clientY
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.frozen || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      this.step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.step(1)
    } else if (e.key === 'Enter') {
      // Leave Enter alone when a focused control will handle it itself.
      if (e.target instanceof HTMLElement && /^(BUTTON|A)$/.test(e.target.tagName)) return
      if (this.n > 0 && this.isSettled()) {
        // Without this the follow-up keypress lands on the sheet's freshly
        // focused Close button and shuts the folio the instant it opens.
        e.preventDefault()
        this.cb.onOpen?.(this.active)
      }
    }
  }
}
