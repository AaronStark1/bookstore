import { memo } from 'react'

/**
 * §2.3 — procedural rag-paper grain: a fixed, non-interactive feTurbulence tile
 * multiplied over the whole viewport (including the detail sheet).
 */
export const PaperGrain = memo(function PaperGrain() {
  return (
    <svg
      id="paper-noise"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full opacity-60 mix-blend-multiply"
      aria-hidden="true"
    >
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix
          type="matrix"
          values="
            0 0 0 0 0.46
            0 0 0 0 0.43
            0 0 0 0 0.38
            0 0 0 0.24 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#noiseFilter)" />
    </svg>
  )
})

/**
 * §1.3 — the two vertical halftone monoliths watermarked into the paper behind
 * the shelf: ARCHIVE and FOLIOS.
 */
export const Monoliths = memo(function Monoliths() {
  return (
    <>
      <div className="monolith monolith-left" aria-hidden="true">
        <span className="monolith-glyphs" data-text="ARCHIVE">
          ARCHIVE
        </span>
      </div>
      <div className="monolith monolith-right" aria-hidden="true">
        <span className="monolith-glyphs" data-text="FOLIOS">
          FOLIOS
        </span>
      </div>
    </>
  )
})
