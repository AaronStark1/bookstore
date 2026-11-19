import { memo, useState, type CSSProperties } from 'react'
import { formatPrice, hasDiscount } from '../lib/format'
import type { ShelfBook } from '../types'

interface CaptionProps {
  book: ShelfBook | undefined
  /** 1-based catalogue number of the active book. */
  no: number
  onPrev: () => void
  onNext: () => void
}

interface Layer {
  book: ShelfBook
  no: number
  seq: number
}

const line = (i: number) => ({ '--i': i }) as CSSProperties

const CaptionBody = memo(function CaptionBody({ layer, out, onDone }: { layer: Layer; out: boolean; onDone?: () => void }) {
  const { book, no } = layer
  const { doc } = book
  // Long titles shrink to stay on one line under the shelf.
  const tscale = doc.title.length <= 20 ? 1 : Math.max(0.46, 20 / doc.title.length)
  const meta = book.year
    ? `${book.year} — ${book.edition ?? doc.language}`
    : `No. ${String(no).padStart(3, '0')} — ${doc.language}`

  return (
    <div className={out ? 'caption-body is-out' : 'caption-body'} aria-hidden={out}>
      <span className="cap-line">
        <span className="cap-slide cap-title" style={{ ...line(0), '--tscale': tscale } as CSSProperties}>
          {doc.title}
        </span>
      </span>
      <span className="cap-line">
        <span className="cap-slide cap-author" style={line(1)}>
          {doc.author}
          <span className="sep">/</span>
          {book.edition ?? doc.category}
        </span>
      </span>
      <span className="cap-line">
        <span className="cap-slide" style={line(2)}>
          <span className="cap-rule block" />
        </span>
      </span>
      <span className="cap-line">
        <span className="cap-slide cap-meta" style={line(3)}>
          {meta}
        </span>
      </span>
      <span className="cap-line">
        {/* The last line of the outgoing layer reports when the whole exit has finished. */}
        <span className="cap-slide cap-price" style={line(4)} onAnimationEnd={out ? onDone : undefined}>
          {formatPrice(doc.dprice)}
          {hasDiscount(doc) && <s>Reg. {formatPrice(doc.price)}</s>}
          {doc.status === 'sold' && <span className="sold">Sold</span>}
        </span>
      </span>
    </div>
  )
})

/**
 * §5.2 — typographic caption. When the active volume changes the outgoing lines
 * slide up out of their masks (translateY(-105%)) while the incoming lines rise
 * from below (translateY(105%) → 0), 600ms, with no opacity involved.
 */
export const Caption = memo(function Caption({ book, no, onPrev, onNext }: CaptionProps) {
  const [current, setCurrent] = useState<Layer | null>(book ? { book, no, seq: 0 } : null)
  const [previous, setPrevious] = useState<Layer | null>(null)

  // Derive the outgoing/incoming layers from the prop change during render.
  if (book && (!current || current.book.id !== book.id || current.no !== no)) {
    setPrevious(current)
    setCurrent({ book, no, seq: (current?.seq ?? 0) + 1 })
  }

  return (
    <>
      <div className="caption" aria-live="polite">
        {previous && (
          <CaptionBody
            key={previous.seq}
            layer={previous}
            out
            onDone={() => setPrevious((p) => (p?.seq === previous.seq ? null : p))}
          />
        )}
        {current && <CaptionBody key={current.seq} layer={current} out={false} />}
      </div>
      <button type="button" className="nav-chevron prev label" onClick={onPrev} aria-label="Previous volume">
        <svg viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M7.5 1 1.5 7l6 6" />
        </svg>
        <span>Prev</span>
      </button>
      <button type="button" className="nav-chevron next label" onClick={onNext} aria-label="Next volume">
        <span>Next</span>
        <svg viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M1.5 1l6 6-6 6" />
        </svg>
      </button>
    </>
  )
})
