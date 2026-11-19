import { memo, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { catalogNo } from '../lib/format'
import type { ShelfBook } from '../types'
import type { ShelfHandle } from './Shelf'

interface Tick {
  frac: number
  major: boolean
  label?: string
}

interface RulerModel {
  mode: 'year' | 'index'
  /** Track position (0…1) of every book, in shelf order. */
  fracs: number[]
  ticks: Tick[]
  /** Distinct positions that actually hold a volume. */
  marks: number[]
}

/**
 * Publication ruler when every volume carries a year; otherwise a catalogue
 * index ruler (the backend schema has no year field, so live books use this).
 */
function buildRuler(books: ShelfBook[]): RulerModel {
  const n = books.length
  const years = books.map((b) => b.year)
  if (n > 0 && years.every((y): y is number => y !== undefined)) {
    const lo = Math.floor(Math.min(...years) / 5) * 5
    let hi = Math.ceil(Math.max(...years) / 5) * 5
    if (hi === lo) hi = lo + 5
    const range = hi - lo
    const minor = range <= 40 ? 1 : range <= 120 ? 5 : 10
    const major = range <= 40 ? 5 : range <= 120 ? 10 : 50
    const ticks: Tick[] = []
    for (let y = lo; y <= hi; y += minor) {
      const isMajor = y % major === 0
      ticks.push({ frac: (y - lo) / range, major: isMajor, label: isMajor ? String(y) : undefined })
    }
    const fracs = years.map((y) => (y - lo) / range)
    return { mode: 'year', fracs, ticks, marks: Array.from(new Set(fracs)) }
  }

  const fracs = books.map((_, i) => (n > 1 ? i / (n - 1) : 0.5))
  const tickEvery = Math.max(1, Math.ceil(n / 90))
  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const ticks: Tick[] = []
  for (let i = 0; i < n; i += tickEvery) {
    const isMajor = i % labelEvery === 0 || i === n - 1
    // Skip a regular label that would collide with the final one.
    const crowded = i !== n - 1 && n - 1 - i < labelEvery / 2
    ticks.push({ frac: fracs[i], major: isMajor, label: isMajor && !crowded ? catalogNo(i) : undefined })
  }
  return { mode: 'index', fracs, ticks, marks: [] }
}

interface TimelineProps {
  books: ShelfBook[]
  shelf: RefObject<ShelfHandle | null>
}

/**
 * §1.5 — archival ruler. The cobalt dot is positioned by the shelf engine on
 * its RAF loop (so it glides with the spring); clicking or scrubbing the ruler
 * glides the shelf to the nearest volume.
 */
export const Timeline = memo(function Timeline({ books, shelf }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const scrub = useRef<{ id: number; last: number } | null>(null)
  const ruler = useMemo(() => buildRuler(books), [books])

  useEffect(() => {
    const handle = shelf.current
    const track = trackRef.current
    const dot = dotRef.current
    if (!handle || !track || !dot) return
    handle.setTimeline({ dot, track, fracs: ruler.fracs })
    return () => handle.setTimeline(null)
  }, [ruler, shelf])

  const seek = (clientX: number) => {
    const track = trackRef.current
    const state = scrub.current
    if (!track || !state || ruler.fracs.length === 0) return
    const rect = track.getBoundingClientRect()
    const frac = (clientX - rect.left) / Math.max(1, rect.width)
    let best = 0
    let bestDist = Infinity
    ruler.fracs.forEach((f, i) => {
      const dist = Math.abs(f - frac)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    if (best !== state.last) {
      state.last = best
      shelf.current?.goTo(best)
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    scrub.current = { id: e.pointerId, last: -1 }
    e.currentTarget.setPointerCapture(e.pointerId)
    seek(e.clientX)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub.current?.id === e.pointerId) seek(e.clientX)
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub.current?.id === e.pointerId) scrub.current = null
  }

  return (
    <div
      className="timeline"
      role="group"
      aria-label={ruler.mode === 'year' ? 'Publication timeline' : 'Catalogue index'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={trackRef} className="timeline-track">
        {ruler.ticks.map((tick) => (
          <span key={`t${tick.frac}`}>
            <span className={tick.major ? 'tick is-major' : 'tick'} style={{ left: `${tick.frac * 100}%` }} />
            {tick.label && (
              <span className="tick-label" style={{ left: `${tick.frac * 100}%` }}>
                {tick.label}
              </span>
            )}
          </span>
        ))}
        {ruler.marks.map((frac) => (
          <span key={`m${frac}`} className="tick-mark" style={{ left: `${frac * 100}%` }} />
        ))}
        <div ref={dotRef} className="timeline-dot" />
      </div>
    </div>
  )
})
